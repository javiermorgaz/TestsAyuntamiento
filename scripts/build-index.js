#!/usr/bin/env node

/**
 * Script para generar automáticamente el archivo tests_index.json
 * Lee todos los archivos JSON de /data/tests/ y genera el índice
 * Opcionalmente sincroniza con Supabase si las credenciales están disponibles
 *
 * Uso: npm run build-index
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- 1. CONFIGURACIÓN DE RUTAS Y CONSTANTES ---
const DATA_DIR = path.join(__dirname, '../data');
const TESTS_DIR = path.join(DATA_DIR, 'tests');
const OUTPUT_FILE = path.join(DATA_DIR, 'tests_index.json');
const TESTS_TABLE = 'tests'; // Nombre de tu tabla

// Ruta al archivo de credenciales (dentro del proyecto en config/)
const AUTH_FILE_PATH = path.join(__dirname, '..', 'config', 'supabaseAuth.txt');

// --- 2. FUNCIÓN PARA CARGAR CREDENCIALES ---
/**
 * Carga y parsea el archivo de credenciales con formato KEY=VALUE.
 * Busca la URL pública (para la conexión) y la SERVICE_KEY (para permisos).
 */
function loadAuthFile() {
    try {
        console.log(`🔎 Buscando credenciales en: ${AUTH_FILE_PATH}`);

        const content = fs.readFileSync(AUTH_FILE_PATH, 'utf-8');
        const config = {};

        // Parsea el archivo línea por línea con formato KEY=VALUE
        content.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                // Usa un regex para manejar el primer '=' y el valor
                const match = trimmedLine.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    // Limpia comillas del valor
                    const value = match[2].trim().replace(/['"]+/g, '');
                    config[key] = value;
                }
            }
        });

        // Validaciones necesarias para el script de sincronización
        const SUPABASE_URL = config.NEXT_PUBLIC_SUPABASE_URL;
        const SERVICE_KEY = config.SUPABASE_SERVICE_KEY || config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
            throw new Error(`El archivo debe contener NEXT_PUBLIC_SUPABASE_URL y (SUPABASE_SERVICE_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY).`);
        }

        console.log('✅ Credenciales cargadas exitosamente.');
        return { SUPABASE_URL, SERVICE_KEY };

    } catch (error) {
        console.warn(`\n⚠️ Error al cargar las credenciales desde el archivo. Solo se generará el índice local: ${error.message}`);
        return null;
    }
}

// --- 3. LÓGICA PRINCIPAL DEL SCRIPT ---
async function buildIndexAndSync() {

    // Cargar credenciales de Supabase (opcional)
    const authConfig = loadAuthFile();
    let supabase = null;

    if (authConfig) {
        try {
            // Usamos la SERVICE_KEY para crear el cliente con permisos de administrador
            supabase = createClient(authConfig.SUPABASE_URL, authConfig.SERVICE_KEY);
            console.log('🔗 Cliente de Supabase inicializado con SERVICE_KEY.');
        } catch (e) {
            console.error('❌ Error al inicializar Supabase:', e.message);
        }
    }

    console.log('🔍 Escaneando tests en /data/tests/...\n');

    try {
        // Leer todos los archivos en /data/tests/
        const files = fs.readdirSync(TESTS_DIR);

        // Filtrar solo archivos .json que sean tests (no el index)
        const testFiles = files.filter(file =>
            file.endsWith('.json') &&
            file !== 'tests_index.json' &&
            (file.startsWith('test') || file.startsWith('bloque') || file.startsWith('tema'))
        );

        if (testFiles.length === 0) {
            console.log('⚠️  No se encontraron archivos de test en /data/tests/');
            process.exit(1);
        }

        console.log(`✅ Encontrados ${testFiles.length} archivos de test:\n`);

        // Procesar cada archivo y extraer metadata
        const testsIndex = [];

        testFiles.forEach((file, index) => {
            const filePath = path.join(TESTS_DIR, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');

            try {
                const testData = JSON.parse(fileContent);

                // Validar que tenga la estructura correcta
                if (!testData.preguntas || !Array.isArray(testData.preguntas)) {
                    console.log(`⚠️  ${file} no tiene estructura válida (falta 'preguntas')`);
                    return;
                }

                const testEntry = {
                    id: testData.id || (index + 1),
                    titulo: testData.titulo || `Test ${index + 1}`,
                    fichero: `tests/${file}`,
                    num_preguntas: testData.preguntas.length
                };

                testsIndex.push(testEntry);
                console.log(`   📝 ${file}`);
                console.log(`      - ID: ${testEntry.id}`);
                console.log(`      - Título: ${testEntry.titulo}`);
                console.log(`      - Preguntas: ${testEntry.num_preguntas}\n`);

            } catch (parseError) {
                console.log(`❌ Error parseando ${file}: ${parseError.message}`);
            }
        });

        // Ordenar por ID
        testsIndex.sort((a, b) => a.id - b.id);

        // --- 4. LÓGICA DE SINCRONIZACIÓN CON SUPABASE ---
        if (supabase && testsIndex.length > 0) {
            console.log('\n🔄 Sincronizando con Supabase...');

            // Paso 1: Borrar todos los registros existentes
            const { error: deleteError } = await supabase
                .from(TESTS_TABLE)
                .delete()
                .neq('id', 0);

            if (deleteError) {
                throw new Error(`Error al borrar la tabla ${TESTS_TABLE}: ${deleteError.message}`);
            }
            console.log('   ✅ Índice anterior borrado.');

            // Paso 2: Insertar el nuevo índice completo
            const { data, error: insertError } = await supabase
                .from(TESTS_TABLE)
                .insert(testsIndex)
                .select();

            if (insertError) {
                throw new Error(`Error al insertar datos en la tabla ${TESTS_TABLE}: ${insertError.message}`);
            }
            console.log(`   ✅ Insertados ${data.length} tests en Supabase.`);
        }

        // --- 5. ESCRIBIR ARCHIVO LOCAL ---
        fs.writeFileSync(
            OUTPUT_FILE,
            JSON.stringify(testsIndex, null, 2),
            'utf-8'
        );

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ Índice generado correctamente!`);
        console.log(`📄 Archivo: ${OUTPUT_FILE}`);
        console.log(`📊 Total de tests: ${testsIndex.length}`);
        if (supabase) {
            console.log(`🔗 Datos sincronizados con Supabase`);
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    } catch (error) {
        console.error('❌ Error al generar el índice:', error.message);
        process.exit(1);
    }
}

buildIndexAndSync();
