// assets/js/supabase-service.js
import { getSupabaseClient } from '@config/supabase.js';

/**
 * Servicio para gestionar las operaciones con Supabase
 * Maneja las tablas: tests y results
 */

// ============================================
// TABLA: tests (Datos Estáticos/Índice)
// ============================================

/**
 * Obtiene todos los tests disponibles desde Supabase
 * @returns {Promise<Array>} Array de tests
 */
async function fetchTestsFromSupabase() {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { data, error } = await client
            .from('tests')
            .select('id, titulo, num_preguntas, fichero') // Payload Optimization: Added 'fichero' fix
            .order('id', { ascending: true });

        if (error) {
            throw error;
        }

        console.log(`✅ Cargados ${data.length} tests desde Supabase`);
        return data;

    } catch (error) {
        console.error('❌ Error al obtener tests desde Supabase:', error);
        throw error;
    }
}

/**
 * Obtiene un test específico por ID
 * @param {number} testId - ID del test
 * @returns {Promise<Object>} Test
 */
async function fetchTestById(testId) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { data, error } = await client
            .from('tests')
            .select('*')
            .eq('id', testId)
            .single();

        if (error) {
            throw error;
        }

        return data;

    } catch (error) {
        console.error(`❌ Error al obtener test ${testId}:`, error);
        throw error;
    }
}

// ============================================
// TABLA: results (Datos Dinámicos/Progreso)
// ============================================

function isMissingUpdatedRowError(error) {
    return error?.code === 'PGRST116'
        || error?.message?.includes('JSON object requested')
        || error?.details?.includes('0 rows');
}

async function insertTestProgress(client, progressData) {
    const { data, error } = await client
        .from('results')
        .insert({
            test_id: progressData.test_id,
            status: 'in_progress',
            answers_data: progressData.answers_data,
            total_questions: progressData.total_questions || progressData.answers_data.length,
            score_percentage: null,
            total_correct: null
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    console.log(`💾 Nuevo progreso creado con ID: ${data.id}`);
    return data;
}

/**
 * Busca si hay un test en progreso para un test específico
 * @param {number} testId - ID del test
 * @returns {Promise<Object|null>} Resultado en progreso o null
 */
async function fetchTestInProgress(testId) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { data, error } = await client
            .from('results')
            .select('*')
            .eq('test_id', testId)
            // .eq('status', 'in_progress') // REMOVED: Fetch latest result regardless of status
            .order('id', { ascending: false })
            .limit(1);

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            console.log(`📝 Test ${testId} tiene progreso guardado`);
            return data[0];
        }

        return null;

    } catch (error) {
        console.error(`❌ Error al buscar progreso del test ${testId}:`, error);
        throw error;
    }
}

/**
 * Carga todo el progreso activo del usuario de una sola vez (Batch Request)
 * @returns {Promise<Array>} Array con todos los resultados en progreso
 */
async function fetchAllTestProgress() {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        // Fetch all results for the user, ordered by latest
        const { data, error } = await client
            .from('results')
            .select('*')
            .order('id', { ascending: false });

        if (error) {
            throw error;
        }

        // Filter locally to get only the latest unique result per test_id
        // This simulates a "DISTINCT ON (test_id)" query which is cleaner here
        const uniqueProgress = [];
        const seenTests = new Set();

        for (const result of data) {
            if (!seenTests.has(result.test_id)) {
                uniqueProgress.push(result);
                seenTests.add(result.test_id);
            }
        }

        console.log(`📦 Progreso en lote cargado: ${uniqueProgress.length} tests iniciados`);
        return uniqueProgress;

    } catch (error) {
        console.error('❌ Error al cargar progreso en lote:', error);
        throw error;
    }
}

/**
 * Guarda o actualiza el progreso de un test
 * @param {Object} progressData - Datos del progreso
 * @param {number} progressData.test_id - ID del test
 * @param {Array} progressData.answers_data - Array con las respuestas [{q_id, selected_option, ...}]
 * @param {number} [progressData.id] - ID del resultado (si es actualización)
 * @returns {Promise<Object>} Resultado guardado
 */
async function saveTestProgress(progressData) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        // Si existe un ID, es una actualización
        if (progressData.id) {
            const { data, error } = await client
                .from('results')
                .update({
                    answers_data: progressData.answers_data,
                    total_questions: progressData.total_questions || progressData.answers_data.length
                })
                .eq('id', progressData.id)
                .select()
                .single();

            if (error) {
                if (isMissingUpdatedRowError(error)) {
                    console.warn(`⚠️ No existe progreso en Supabase con ID ${progressData.id}; creando uno nuevo.`);
                    return await insertTestProgress(client, progressData);
                }
                throw error;
            }

            console.log(`💾 Progreso actualizado para resultado ID: ${progressData.id}`);
            return data;

        } else {
            // Es un nuevo registro
            return await insertTestProgress(client, progressData);
        }

    } catch (error) {
        console.error('❌ Error al guardar progreso:', error);
        throw error;
    }
}

/**
 * Completa un test y guarda el resultado final
 * @param {Object} resultData - Datos del resultado
 * @param {number} resultData.id - ID del resultado en progreso
 * @param {number} resultData.test_id - ID del test
 * @param {number} resultData.total_correct - Total de respuestas correctas
 * @param {number} resultData.total_questions - Total de preguntas
 * @param {number} resultData.score_percentage - Porcentaje de aciertos
 * @param {Array} resultData.answers_data - Array completo con las respuestas
 * @returns {Promise<Object>} Resultado completado
 */
async function completeTestSupabase(resultData) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        // Si existe un ID (test en progreso), actualizamos
        if (resultData.id) {
            const { data, error } = await client
                .from('results')
                .update({
                    status: 'in_progress', // Keep as in_progress to allow modifications
                    score_percentage: resultData.score_percentage,
                    total_correct: resultData.total_correct,
                    total_questions: resultData.total_questions,
                    answers_data: resultData.answers_data
                })
                .eq('id', resultData.id)
                .select()
                .single();

            if (error) {
                throw error;
            }

            console.log(`✅ Test evaluado (actualizado ID: ${resultData.id})`);
            return data;

        } else {
            // Crear nuevo resultado evaluado
            const { data, error } = await client
                .from('results')
                .insert({
                    test_id: resultData.test_id,
                    status: 'in_progress', // Keep as in_progress
                    score_percentage: resultData.score_percentage,
                    total_correct: resultData.total_correct,
                    total_questions: resultData.total_questions,
                    answers_data: resultData.answers_data
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            console.log(`✅ Test completado (nuevo ID: ${data.id})`);
            return data;
        }

    } catch (error) {
        console.error('❌ Error al completar test:', error);
        throw error;
    }
}

/**
 * Obtiene el historial de resultados de un test específico
 * @param {number} testId - ID del test
 * @param {number} [limit=10] - Límite de resultados a obtener
 * @returns {Promise<Array>} Array de resultados completados
 */
async function fetchTestHistory(testId, limit = 10) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { data, error } = await client
            .from('results')
            .select('*')
            .eq('test_id', testId)
            .eq('status', 'completed')
            .order('id', { ascending: false })
            .limit(limit);

        if (error) {
            throw error;
        }

        console.log(`📊 Cargados ${data.length} resultados históricos del test ${testId}`);
        return data;

    } catch (error) {
        console.error(`❌ Error al obtener historial del test ${testId}:`, error);
        throw error;
    }
}

/**
 * Obtiene todos los resultados completados (para estadísticas generales)
 * @returns {Promise<Array>} Array de todos los resultados completados
 */
async function fetchAllResults() {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { data, error } = await client
            .from('results')
            .select('*')
            .eq('status', 'completed')
            .order('id', { ascending: false });

        if (error) {
            throw error;
        }

        console.log(`📊 Cargados ${data.length} resultados totales`);
        return data;

    } catch (error) {
        console.error('❌ Error al obtener todos los resultados:', error);
        throw error;
    }
}

/**
 * Elimina un resultado en progreso (útil si el usuario quiere empezar de nuevo)
 * @param {number} resultId - ID del resultado a eliminar
 * @returns {Promise<boolean>} true si se eliminó correctamente
 */
async function deleteTestProgress(resultId) {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            throw new Error('Cliente de Supabase no disponible');
        }

        const { error } = await client
            .from('results')
            .delete()
            .eq('id', resultId);

        if (error) {
            throw error;
        }

        console.log(`🗑️ Progreso eliminado (ID: ${resultId})`);
        return true;

    } catch (error) {
        console.error(`❌ Error al eliminar progreso ${resultId}:`, error);
        throw error;
    }
}

// Exportaciones para ES Modules
export {
    getSupabaseClient,
    fetchTestsFromSupabase,
    fetchTestById,
    fetchTestInProgress,
    saveTestProgress,
    completeTestSupabase,
    fetchTestHistory,
    fetchAllResults,
    deleteTestProgress,
    fetchAllTestProgress
};
