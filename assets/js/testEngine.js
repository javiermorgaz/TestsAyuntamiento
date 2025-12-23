/**
 * TestEngine - Lógica de negocio del sistema de tests (v3.0)
 * 
 * Se encarga de evaluar respuestas, calcular puntuaciones y
 * procesar los datos resultantes sin tocar el DOM.
 */

import StateManager from './stateManager.js';

const TestEngine = {
    /**
     * Evalúa las respuestas del usuario comparándolas con las correctas
     * @param {Array} questions - Array de objetos pregunta
     * @param {Array} userResponses - Array de respuestas del usuario
     * @returns {Object} Objeto con estadísticas y detalle
     */
    evaluate(questions, userResponses) {
        let correctCount = 0;
        let errorCount = 0;
        let unansweredCount = 0;
        const detail = [];

        questions.forEach((q, i) => {
            const userAnswer = userResponses[i];
            const isCorrect = userAnswer === q.respuesta_correcta;
            const isUnanswered = userAnswer === null;

            if (isUnanswered) {
                unansweredCount++;
            } else if (isCorrect) {
                correctCount++;
            } else {
                errorCount++;
            }

            detail.push({
                pregunta: q.enunciado,
                opciones: q.opciones,
                respuestaUsuario: userAnswer,
                respuestaCorrecta: q.respuesta_correcta,
                esCorrecta: isCorrect,
                enBlanco: isUnanswered
            });
        });

        const total = questions.length;
        const score = (correctCount / total) * 100;

        return {
            aciertos: correctCount,
            errores: errorCount,
            blancos: unansweredCount,
            total,
            score,
            detalle: detail
        };
    }
};

export default TestEngine;
