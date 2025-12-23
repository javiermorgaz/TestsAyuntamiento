/**
 * StateManager - El cerebro de la aplicación (v3.0)
 * 
 * Centraliza el estado para evitar variables globales dispersas y
 * asegurar que todas las partes de la app lean la misma información.
 */

const StateManager = (function () {
    // Estado privado (Single Source of Truth)
    let _state = {
        currentTest: null,
        userResponses: [],
        currentProgressId: null,
        autoSaveInterval: null,
        currentViewMode: 'list',
        lastSliderIndex: -1
    };

    /**
     * Obtiene el valor de una propiedad del estado
     * @param {string} key - Nombre de la propiedad
     */
    function get(key) {
        return _state[key];
    }

    /**
     * Actualiza una o varias propiedades del estado
     * @param {Object} newState - Objeto con los cambios
     */
    function set(newState) {
        _state = { ..._state, ...newState };
        console.log('🔄 Estado actualizado:', newState);
    }

    /**
     * Reinicia el estado a sus valores por defecto
     */
    function reset() {
        _state = {
            currentTest: null,
            userResponses: [],
            currentProgressId: null,
            autoSaveInterval: null,
            currentViewMode: 'list',
            lastSliderIndex: -1
        };
        console.log('🧹 Estado reiniciado');
    }

    /**
     * Inicializa las respuestas del usuario según el número de preguntas
     * @param {number} count - Número de preguntas
     */
    function initResponses(count) {
        _state.userResponses = new Array(count).fill(null);
    }

    /**
     * Guarda una respuesta específica
     * @param {number} index - Índice de la pregunta
     * @param {any} answer - Respuesta seleccionada
     */
    function setAnswer(index, answer) {
        _state.userResponses[index] = answer;
    }

    return {
        get,
        set,
        reset,
        initResponses,
        setAnswer
    };
})();

export default StateManager;
