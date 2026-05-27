// assets/js/storage.js

/**
 * Funciones para manejar localStorage
 * Aquí se guardarán y recuperarán los resultados de los tests
 */

const STORAGE_KEY = 'testResultados';
const PROGRESS_KEY = 'testProgress';

/**
 * Guarda un resultado de test en localStorage
 * @param {Object} resultado - Objeto con la información del resultado
 */
function saveResult(resultado) {
    const results = getResults();
    results.push(resultado);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
}

/**
 * Obtiene todos los resultados guardados
 * @returns {Array<Object>} Array de resultados
 */
function getResults() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

/**
 * Obtiene los resultados de un test específico
 * @param {number} testId - ID del test
 * @returns {Array<Object>} Array de resultados del test
 */
function getTestResults(testId) {
    const results = getResults();
    return results.filter(r => r.testId === testId);
}

/**
 * Limpia todos los resultados guardados
 */
function clearResults() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * Guarda o actualiza el progreso en curso de un test.
 * @param {Object} progress - Datos del progreso en curso
 * @returns {Object} Progreso guardado
 */
function saveProgress(progress) {
    const allProgress = getAllProgress();
    const existingIndex = allProgress.findIndex(p => p.test_id === progress.test_id);
    const existing = existingIndex >= 0 ? allProgress[existingIndex] : null;
    const savedProgress = {
        ...existing,
        ...progress,
        id: progress.id || existing?.id || Date.now(),
        status: 'in_progress',
        updated_at: new Date().toISOString()
    };

    if (!savedProgress.created_at) {
        savedProgress.created_at = savedProgress.updated_at;
    }

    if (existingIndex >= 0) {
        allProgress[existingIndex] = savedProgress;
    } else {
        allProgress.push(savedProgress);
    }

    localStorage.setItem(PROGRESS_KEY, JSON.stringify(allProgress));
    return savedProgress;
}

/**
 * Obtiene todo el progreso en curso guardado localmente.
 * @returns {Array<Object>} Array de progreso en curso
 */
function getAllProgress() {
    const data = localStorage.getItem(PROGRESS_KEY);
    return data ? JSON.parse(data) : [];
}

/**
 * Obtiene el progreso en curso de un test específico.
 * @param {number} testId - ID del test
 * @returns {Object|null} Progreso encontrado o null
 */
function getProgress(testId) {
    return getAllProgress().find(p => p.test_id === testId) || null;
}

/**
 * Elimina un progreso en curso.
 * @param {number} progressId - ID del progreso
 * @returns {boolean} True si se eliminó algún progreso
 */
function deleteProgress(progressId) {
    const allProgress = getAllProgress();
    const filteredProgress = allProgress.filter(p => p.id !== progressId);

    localStorage.setItem(PROGRESS_KEY, JSON.stringify(filteredProgress));
    return filteredProgress.length !== allProgress.length;
}

// Exportaciones para ES Modules
export {
    saveResult,
    getResults,
    getTestResults,
    clearResults,
    saveProgress,
    getProgress,
    getAllProgress,
    deleteProgress
};
