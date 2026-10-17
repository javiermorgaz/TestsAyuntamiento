#!/usr/bin/env node

/**
 * Script para generar automáticamente el archivo tests_index.json
 * Lee todos los archivos JSON de /data/tests/ y genera el índice
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar variables de entorno desde .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// --- 1. CONFIGURACIÓN DE RUTAS Y CONSTANTES ---
const DATA_DIR = path.join(__dirname, '../public/data');
const TESTS_DIR = path.join(DATA_DIR, 'tests');
const OUTPUT_FILE = path.join(DATA_DIR, 'tests_index.json');
const TESTS_TABLE = 'tests';

// --- 2. FUNCIÓN PARA CARGAR CREDENCIALES ---
function loadCredentials() {
    try {
        console.log('🔎 Buscando credenciales en variables de entorno (.env)...');

        const SUPABASE_URL = process.env.VITE_SUPABASE_URL;

        const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
            || process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!SUPABASE_URL) {
            throw new Error('Falta VITE_SUPABASE_URL en el archivo .env');
        }

        if (!SERVICE_KEY) {
            throw new Error('Falta clave de Supabase. Necesitas:\n' +
                '   - SUPABASE_SERVICE_KEY (recomendada)\n' +
                '   - VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');
        }

        const keyType = process.env.SUPABASE_SERVICE_KEY ? 'SERVICE_KEY' : 'PUBLISHABLE_DEFAULT_KEY';

        console.log(`✅ Credenciales cargadas (${keyType})`);

        if (keyType === 'PUBLISHABLE_DEFAULT_KEY') {
            console.warn('⚠️  Usando clave pública. Para sincronización completa, usa SUPABASE_SERVICE_KEY');
        }

        return { SUPABASE_URL, SERVICE_KEY };

    } catch (error) {
        console.warn(`\n⚠️ ${error.message}`);

        return null;
    }
}

// --- 3. LÓGICA PRINCIPAL DEL SCRIPT ---
async function buildIndexAndSync() {
    const authConfig = loadCredentials();
    let supabase = null;

    if (authConfig) {
        try {
            supabase = createClient(authConfig.SUPABASE_URL, authConfig.SERVICE_KEY);
            console.log('🔗 Cliente de Supabase inicializado con SERVICE_KEY.');
        } catch (e) {
            console.error('❌ Error al inicializar Supabase:', e.message);
        }
    }

    console.log('🔍 Escaneando tests en /data/tests/...\n');

    try {
        const files = fs.readdirSync(TESTS_DIR);
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
        const testsIndex = [];

        testFiles.forEach((file, index) => {
            const filePath = path.join(TESTS_DIR, file);
            const fileContent = fs.readFileSync(filePath, 'utf-8');

            try {
                const testData = JSON.parse(fileContent);
                if (!testData.preguntas || !Array.isArray(testData.preguntas)) {
                    console.log(`⚠️  ${file} no tiene estructura válida`);
                    return;
                }

                const testEntry = {
                    id: testData.id || (index + 1),
                    titulo: testData.titulo || `Test ${index + 1}`,
                    fichero: `tests/${file}`,
                    num_preguntas: testData.preguntas.length
                };

                testsIndex.push(testEntry);
                console.log(`   📝 ${file} - ID: ${testEntry.id}`);

            } catch (parseError) {
                console.log(`❌ Error parseando ${file}: ${parseError.message}`);
            }
        });

        testsIndex.sort((a, b) => a.id - b.id);

        if (supabase && testsIndex.length > 0) {
            console.log('\n🔄 Sincronizando con Supabase...');
            try {
                const { data, error: upsertError } = await supabase
                    .from(TESTS_TABLE)
                    .upsert(testsIndex, { onConflict: 'id' })
                    .select();

                if (upsertError) {
                    throw new Error(`Error al sincronizar con Supabase: ${upsertError.message}\n` +
                        `Detalles: ${JSON.stringify(upsertError, null, 2)}`);
                }

                if (!data || data.length === 0) {
                    throw new Error('La sincronización no devolvió datos. Verifica permisos y que la tabla existe.');
                }

                console.log(`   ✅ Sincronizados ${data.length} tests en Supabase.`);

            } catch (syncError) {
                // Re-lanzar para que el catch principal lo capture
                throw syncError;
            }
        } else if (!supabase) {
            console.log('\n⏭️  Saltando sincronización con Supabase (no hay credenciales).');
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(testsIndex, null, 2), 'utf-8');
        console.log(`\n✅ Índice generado correctamente: ${OUTPUT_FILE}\n`);

    } catch (error) {
        console.error('❌ Error fatal:', error.message);
        process.exit(1);
    }
}

buildIndexAndSync();
