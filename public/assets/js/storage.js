// assets/js/storage.js

/**
 * Funciones para manejar localStorage
 * Aquí se guardarán y recuperarán los resultados de los tests
 */

const STORAGE_KEY = 'testResultados';

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
