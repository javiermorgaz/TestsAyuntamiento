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
function guardarResultado(resultado) {
    const resultados = obtenerResultados();
    resultados.push(resultado);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(resultados));
}

/**
 * Obtiene todos los resultados guardados
 * @returns {Array<Object>} Array de resultados
 */
function obtenerResultados() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
}

/**
 * Obtiene los resultados de un test específico
 * @param {number} testId - ID del test
 * @returns {Array<Object>} Array de resultados del test
 */
function obtenerResultadosTest(testId) {
    const resultados = obtenerResultados();
    return resultados.filter(r => r.testId === testId);
}

/**
 * Limpia todos los resultados guardados
 */
function limpiarResultados() {
    localStorage.removeItem(STORAGE_KEY);
}
