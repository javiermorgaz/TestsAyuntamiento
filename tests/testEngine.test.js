/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock console to avoid noise in tests
global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Import the module under test
const TestEngine = await import('../assets/js/testEngine.js');

describe('TestEngine (Pure Logic Tests)', () => {

    describe('evaluate', () => {
        test('should calculate score percentage correctly', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 },
                { enunciado: 'Q2', opciones: ['a', 'b'], respuesta_correcta: 1 },
                { enunciado: 'Q3', opciones: ['a', 'b'], respuesta_correcta: 0 },
                { enunciado: 'Q4', opciones: ['a', 'b'], respuesta_correcta: 1 },
                { enunciado: 'Q5', opciones: ['a', 'b'], respuesta_correcta: 0 }
            ];
            const userResponses = [0, 1, 0, 1, 0]; // 5 correctas de 5

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.aciertos).toBe(5);
            expect(result.errores).toBe(0);
            expect(result.blancos).toBe(0);
            expect(result.score).toBe(100);
        });

        test('should handle all incorrect answers', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 },
                { enunciado: 'Q2', opciones: ['a', 'b'], respuesta_correcta: 1 }
            ];
            const userResponses = [1, 0]; // 0 correctas de 2

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.aciertos).toBe(0);
            expect(result.errores).toBe(2);
            expect(result.score).toBe(0);
        });

        test('should identify correct answer', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 }
            ];
            const userResponses = [0];

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.detalle[0].esCorrecta).toBe(true);
            expect(result.detalle[0].enBlanco).toBe(false);
        });

        test('should identify incorrect answer', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 }
            ];
            const userResponses = [1];

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.detalle[0].esCorrecta).toBe(false);
            expect(result.detalle[0].enBlanco).toBe(false);
        });

        test('should identify blank answer', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 }
            ];
            const userResponses = [null];

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.detalle[0].enBlanco).toBe(true);
            expect(result.detalle[0].esCorrecta).toBe(false);
            expect(result.blancos).toBe(1);
        });

        test('should calculate mixed results correctly', () => {
            const questions = [
                { enunciado: 'Q1', opciones: ['a', 'b'], respuesta_correcta: 0 },
                { enunciado: 'Q2', opciones: ['a', 'b'], respuesta_correcta: 1 },
                { enunciado: 'Q3', opciones: ['a', 'b'], respuesta_correcta: 0 },
                { enunciado: 'Q4', opciones: ['a', 'b'], respuesta_correcta: 1 },
                { enunciado: 'Q5', opciones: ['a', 'b'], respuesta_correcta: 0 }
            ];
            const userResponses = [0, 1, 1, null, 0]; // 3 correctas, 1 error, 1 blanco

            const result = TestEngine.default.evaluate(questions, userResponses);

            expect(result.aciertos).toBe(3);
            expect(result.errores).toBe(1);
            expect(result.blancos).toBe(1);
            expect(result.total).toBe(5);
            expect(result.score).toBe(60);
        });
    });
});
