#!/usr/bin/env node

/**
 * Script para generar automáticamente el archivo tests_index.json
 * Lee todos los archivos JSON de /data/ y genera el índice
 *
 * Uso: npm run build-index
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const TESTS_DIR = path.join(DATA_DIR, 'tests');
const OUTPUT_FILE = path.join(DATA_DIR, 'tests_index.json');

console.log('🔍 Escaneando tests en /data/tests/...\n');

try {
    // Leer todos los archivos en /data/tests/
    const files = fs.readdirSync(TESTS_DIR);

    // Filtrar solo archivos .json que sean tests (no el index)
    const testFiles = files.filter(file =>
        file.endsWith('.json') &&
        file !== 'tests_index.json' &&
        (file.startsWith('test') || file.startsWith('bloque'))
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
                ley: testData.ley || '',
                fichero: `tests/${file}`,
                num_preguntas: testData.preguntas.length
            };

            testsIndex.push(testEntry);
            console.log(`   📝 ${file}`);
            console.log(`      - ID: ${testEntry.id}`);
            console.log(`      - Título: ${testEntry.titulo}`);
            console.log(`      - Ley: ${testEntry.ley}`);
            console.log(`      - Preguntas: ${testEntry.num_preguntas}\n`);

        } catch (parseError) {
            console.log(`❌ Error parseando ${file}: ${parseError.message}`);
        }
    });

    // Ordenar por ID
    testsIndex.sort((a, b) => a.id - b.id);

    // Escribir el archivo de índice
    fs.writeFileSync(
        OUTPUT_FILE,
        JSON.stringify(testsIndex, null, 2),
        'utf-8'
    );

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Índice generado correctamente!`);
    console.log(`📄 Archivo: ${OUTPUT_FILE}`);
    console.log(`📊 Total de tests: ${testsIndex.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

} catch (error) {
    console.error('❌ Error al generar el índice:', error.message);
    process.exit(1);
}
