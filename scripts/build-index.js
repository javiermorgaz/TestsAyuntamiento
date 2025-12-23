#!/usr/bin/env node

/**
 * Script para generar automáticamente el archivo tests_index.json
 * Lee todos los archivos JSON de /data/tests/ y genera el índice
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- 1. CONFIGURACIÓN DE RUTAS Y CONSTANTES ---
const DATA_DIR = path.join(__dirname, '../data');
const TESTS_DIR = path.join(DATA_DIR, 'tests');
const OUTPUT_FILE = path.join(DATA_DIR, 'tests_index.json');
const TESTS_TABLE = 'tests';

const AUTH_FILE_PATH = path.join(__dirname, '..', 'config', 'supabaseAuth.txt');

// --- 2. FUNCIÓN PARA CARGAR CREDENCIALES ---
function loadAuthFile() {
    try {
        console.log(`🔎 Buscando credenciales en: ${AUTH_FILE_PATH}`);

        const content = fs.readFileSync(AUTH_FILE_PATH, 'utf-8');
        const config = {};

        content.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const match = trimmedLine.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim().replace(/['"]+/g, '');
                    config[key] = value;
                }
            }
        });

        const SUPABASE_URL = config.NEXT_PUBLIC_SUPABASE_URL;
        const SERVICE_KEY = config.SUPABASE_SERVICE_KEY || config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!SUPABASE_URL || !SERVICE_KEY) {
            throw new Error(`El archivo debe contener NEXT_PUBLIC_SUPABASE_URL y credentials.`);
        }

        console.log('✅ Credenciales cargadas exitosamente.');
        return { SUPABASE_URL, SERVICE_KEY };

    } catch (error) {
        console.warn(`\n⚠️ Error al cargar las credenciales: ${error.message}`);
        return null;
    }
}

// --- 3. LÓGICA PRINCIPAL DEL SCRIPT ---
async function buildIndexAndSync() {
    const authConfig = loadAuthFile();
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
            const { data, error: upsertError } = await supabase
                .from(TESTS_TABLE)
                .upsert(testsIndex, { onConflict: 'id' })
                .select();

            if (upsertError) {
                throw new Error(`Error al sincronizar datos: ${upsertError.message}`);
            }
            console.log(`   ✅ Sincronizados ${data.length} tests en Supabase.`);
        }

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(testsIndex, null, 2), 'utf-8');
        console.log(`\n✅ Índice generado correctamente: ${OUTPUT_FILE}\n`);

    } catch (error) {
        console.error('❌ Error fatal:', error.message);
        process.exit(1);
    }
}

buildIndexAndSync();
