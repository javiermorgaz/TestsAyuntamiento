/**
 * Data Service - Capa de Abstracción para Supabase + localStorage
 *
 * Este servicio maneja la lógica híbrida:
 * - Intenta usar Supabase como fuente principal
 * - Fallback automático a localStorage si Supabase no está disponible
 * - Modo offline completamente funcional
 */

import {
    fetchTestsFromSupabase,
    fetchTestById,
    fetchTestInProgress,
    saveTestProgress,
    completeTestSupabase,
    fetchTestHistory,
    fetchAllResults,
    deleteTestProgress,
    fetchAllTestProgress
} from './supabase-service.js';

import { getSupabaseClient } from '@config/supabase.js';

import {
    saveResult,
    getResults,
    getTestResults,
    clearResults,
    saveProgress as saveLocalProgress,
    getProgress as getLocalProgress,
    getAllProgress as getAllLocalProgress,
    deleteProgress as deleteLocalProgress
} from './storage.js';

// ============================================
// VERIFICACIÓN DE DISPONIBILIDAD
// ============================================

/**
 * Verifica si Supabase está disponible y configurado
 * @returns {Promise<boolean>}
 */
async function isSupabaseAvailable() {
    try {
        const client = await getSupabaseClient();
        return client !== null;
    } catch (error) {
        console.log('ℹ️ Supabase no disponible, usando modo offline');
        return false;
    }
}

// ============================================
// GESTIÓN DE TESTS (Catálogo)
// ============================================

/**
 * Obtiene la lista de tests disponibles
 * Intenta desde Supabase, fallback a JSON local
 * @returns {Promise<Array>} Lista de tests
 */
async function fetchTests() {
    try {
        // Intentar desde Supabase
        if (await isSupabaseAvailable()) {
            console.log('📡 Cargando tests desde Supabase...');
            const tests = await fetchTestsFromSupabase();
            if (tests && tests.length > 0) {
                console.log(`✅ ${tests.length} tests cargados desde Supabase`);
                return tests;
            }
        }
    } catch (error) {
        console.warn('⚠️ Error al cargar desde Supabase:', error.message);
    }

    // Fallback: cargar desde JSON local
    try {
        console.log('📁 Cargando tests desde archivo local...');
        const response = await fetch('./data/tests_index.json');
        const tests = await response.json();
        console.log(`✅ ${tests.length} tests cargados desde archivo local`);
        return tests;
    } catch (error) {
        console.error('❌ Error al cargar tests:', error);
        return [];
    }
}

/**
 * Obtiene un test con sus preguntas
 * @param {number} testId - ID del test
 * @param {string} fileName - Nombre del archivo JSON (ej: "tests/tema1.json")
 * @returns {Promise<Object>} Test con título y preguntas
 */
async function getTestWithQuestions(testId, fileName) {
    try {
        const response = await fetch(`./data/${fileName}`);
        const testData = await response.json();
        console.log(`✅ Test ${testId} cargado con ${testData.preguntas.length} preguntas`);
        return testData;
    } catch (error) {
        console.error('❌ Error al cargar test:', error);
        return null;
    }
}

// ============================================
// GESTIÓN DE HISTORIAL
// ============================================

/**
 * Obtiene el historial de resultados de un test específico
 * @param {number} testId - ID del test
 * @param {number} limit - Cantidad máxima de resultados (default: 3)
 * @returns {Promise<Array>} Lista de resultados
 */
async function fetchHistory(testId, limit = 3) {
    try {
        // Intentar desde Supabase
        if (await isSupabaseAvailable()) {
            const history = await fetchTestHistory(testId, limit);
            if (history && history.length > 0) {
                console.log(`📊 Historial cargado desde Supabase: ${history.length} resultados`);
                return history.map(resultado => ({
                    fecha: resultado.created_at,
                    aciertos: resultado.total_correct,
                    total: resultado.total_questions,
                    porcentaje: resultado.score_percentage
                }));
            }
        }
    } catch (error) {
        console.warn('⚠️ Error al cargar historial desde Supabase:', error.message);
    }

    // Fallback: cargar desde localStorage
    try {
        const allResults = getResults(); // Function from storage.js
        const testResults = allResults
            .filter(r => r.testId === testId)
            .slice(0, limit)
            .map(r => ({
                fecha: r.fecha,
                aciertos: r.aciertos,
                total: r.total,
                porcentaje: ((r.aciertos / r.total) * 100).toFixed(1)
            }));

        console.log(`💾 Historial cargado desde localStorage: ${testResults.length} resultados`);
        return testResults;
    } catch (error) {
        console.error('❌ Error al cargar historial:', error);
        return [];
    }
}

// ============================================
// GESTIÓN DE PROGRESO
// ============================================

/**
 * Busca si existe un test en progreso
 * @param {number} testId - ID del test
 * @returns {Promise<Object|null>} Objeto con progreso o null
 */
async function findTestProgress(testId) {
    try {
        if (await isSupabaseAvailable()) {
            const progress = await fetchTestInProgress(testId);
            if (progress) {
                console.log(`🔄 Test en progreso encontrado (${progress.answers_data.filter(a => a !== null).length} respuestas)`);
            } else {
                console.log(`📡 Supabase no tiene progreso para el test ${testId}`);
            }
            return progress;
        }
    } catch (error) {
        console.warn('⚠️ Error al buscar progreso:', error.message);
    }

    try {
        const progress = getLocalProgress(testId);
        if (progress) {
            console.log(`💾 Progreso local encontrado (${progress.answers_data.filter(a => a !== null).length} respuestas)`);
            return progress;
        }
    } catch (error) {
        console.warn('⚠️ Error al buscar progreso local:', error.message);
    }

    return null;
}

/**
 * Carga todo el progreso activo del usuario de una sola vez
 * @returns {Promise<Array>} Array con todos los resultados en progreso con status 'in_progress'
 */
async function fetchAllProgress() {
    try {
        if (await isSupabaseAvailable()) {
            const allProgress = await fetchAllTestProgress();
            console.log(`📡 Progreso batch cargado: ${allProgress?.length || 0} items`);
            return allProgress || [];
        }
    } catch (error) {
        console.warn('⚠️ Error al cargar progreso batch:', error.message);
    }

    try {
        const allProgress = getAllLocalProgress();
        if (allProgress.length > 0) {
            console.log(`💾 Progreso local batch cargado: ${allProgress.length} items`);
        }
        return allProgress;
    } catch (error) {
        console.warn('⚠️ Error al cargar progreso local:', error.message);
        return [];
    }
}

/**
 * Guarda el progreso actual de un test
 * @param {Object} data - Datos del progreso
 * @param {number} data.id - ID del resultado (null para crear nuevo)
 * @param {number} data.test_id - ID del test
 * @param {Array} data.answers_data - Array con respuestas del usuario
 * @param {number} data.total_questions - Total de preguntas del test
 * @returns {Promise<Object>} Resultado guardado
 */
async function saveProgress(data) {
    try {
        if (await isSupabaseAvailable()) {
            const resultado = await saveTestProgress(data);
            console.log(`💾 Progreso guardado en Supabase (ID: ${resultado.id})`);
            return resultado;
        }
    } catch (error) {
        console.warn('⚠️ Error al guardar en Supabase, guardando localmente:', error.message);
    }

    const savedProgress = saveLocalProgress({
        id: data.id || Date.now(),
        ...data,
        status: 'in_progress'
    });

    console.log('💾 Progreso guardado en localStorage');
    return savedProgress;
}

/**
 * Elimina un progreso en curso
 * @param {number} progressId - ID del progreso a eliminar
 * @returns {Promise<boolean>} True si se eliminó correctamente
 */
async function deleteProgress(progressId) {
    try {
        if (await isSupabaseAvailable()) {
            const isDeleted = await deleteTestProgress(progressId);
            if (isDeleted) {
                console.log('🗑️ Progreso eliminado de Supabase');
                return true;
            }
        }
    } catch (error) {
        console.warn('⚠️ Error al eliminar progreso:', error.message);
    }

    try {
        const isDeleted = deleteLocalProgress(progressId);
        if (isDeleted) {
            console.log('🗑️ Progreso eliminado de localStorage');
        }
        return isDeleted;
    } catch (error) {
        console.warn('⚠️ Error al eliminar progreso local:', error.message);
        return false;
    }
}

// ============================================
// FINALIZACIÓN DE TESTS
// ============================================

/**
 * Completa un test y guarda el resultado final
 * @param {Object} data - Datos del resultado
 * @param {number} data.id - ID del resultado en progreso (opcional)
 * @param {number} data.test_id - ID del test
 * @param {number} data.total_correct - Cantidad de respuestas correctas
 * @param {number} data.total_questions - Total de preguntas
 * @param {number} data.score_percentage - Porcentaje de aciertos
 * @param {Array} data.answers_data - Array con todas las respuestas y correcciones
 * @returns {Promise<Object>} Resultado guardado
 */
async function completeTest(data) {
    let savedToSupabase = false;

    // Intentar guardar en Supabase
    try {
        if (await isSupabaseAvailable()) {
            const resultado = await completeTestSupabase(data);
            console.log('✅ Resultado guardado en Supabase');
            savedToSupabase = true;

            // También guardar en localStorage como backup
            saveToLocalStorage(data);

            return resultado;
        }
    } catch (error) {
        console.warn('⚠️ Error al guardar en Supabase:', error.message);
    }

    // Fallback: guardar solo en localStorage
    if (!savedToSupabase) {
        console.log('💾 Resultado guardado solo en localStorage');
        return saveToLocalStorage(data);
    }
}

/**
 * Guarda resultado en localStorage (función auxiliar)
 * @private
 */
function saveToLocalStorage(data) {
    if (data.id) {
        deleteLocalProgress(data.id);
    }

    const resultado = {
        testId: data.test_id,
        fecha: new Date().toISOString(),
        aciertos: data.total_correct,
        errores: data.total_questions - data.total_correct,
        blancos: 0,
        total: data.total_questions,
        respuestas: data.answers_data, // It is already a simple array now
        detalle: null // We don't need complex detail here for now
    };

    // Usar función de storage.js
    saveResult(resultado);

    return resultado;
}

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

/**
 * Verifica el estado de la conexión
 * @returns {Promise<Object>} Estado de la conexión
 */
async function checkStatus() {
    const supabaseDisponible = await isSupabaseAvailable();

    return {
        supabase: supabaseDisponible,
        localStorage: typeof (Storage) !== "undefined",
        modo: supabaseDisponible ? 'online' : 'offline'
    };
}

// ============================================
// LOG DE INICIALIZACIÓN
// ============================================

// Log de inicialización manual si es necesario
async function init() {
    const status = await checkStatus();
    console.log('🚀 Data Service inicializado');
    console.log(`   Modo: ${status.modo.toUpperCase()}`);
    console.log(`   Supabase: ${status.supabase ? '✅' : '❌'}`);
    console.log(`   localStorage: ${status.localStorage ? '✅' : '❌'}`);
}
// init(); // Ejecutar bajo demanda

// Object export for provider
export const realDataService = {
    fetchTests,
    getTestWithQuestions,
    fetchHistory,
    findTestProgress,
    fetchAllProgress,
    saveProgress,
    deleteProgress,
    completeTest,
    checkStatus,
    isSupabaseAvailable,
    saveToLocalStorage
};

// Original named exports for compatibility if needed
export {
    fetchTests,
    getTestWithQuestions,
    fetchHistory,
    findTestProgress,
    fetchAllProgress,
    saveProgress,
    deleteProgress,
    completeTest,
    checkStatus,
    isSupabaseAvailable,
    saveToLocalStorage
};
