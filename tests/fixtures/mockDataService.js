/**
 * Mock Data Service - Mock implementation for testing
 * Uses fixtures from tests/fixtures/
 */

import mockTests from './mock-tests.json';
import mockQuestionsMap from './mock-questions.json';

export const mockDataService = {
    async fetchTests() {
        console.log('🧪 [MOCK] fetchTests');
        return mockTests;
    },

    async fetchHistory(testId, limit = 3) {
        console.log(`🧪 [MOCK] fetchHistory for test ${testId}`);
        // Return dummy history
        return [
            { fecha: new Date().toISOString(), aciertos: 10, total: 10, porcentaje: "100.0" }
        ];
    },

    async findTestProgress(testId) {
        console.log(`🧪 [MOCK] findTestProgress for test ${testId}`);
        return null; // No progress by default in mock
    },

    async saveProgress(data) {
        console.log('🧪 [MOCK] saveProgress', data);
        return { id: 999, ...data, status: 'in_progress' };
    },

    async deleteProgress(progressId) {
        console.log(`🧪 [MOCK] deleteProgress ${progressId}`);
        return true;
    },

    async completeTest(data) {
        console.log('🧪 [MOCK] completeTest', data);
        return {
            testId: data.test_id,
            fecha: new Date().toISOString(),
            aciertos: data.total_correct,
            errores: data.total_questions - data.total_correct,
            blancos: 0,
            total: data.total_questions,
            respuestas: data.answers_data
        };
    },

    async checkStatus() {
        return {
            supabase: false,
            localStorage: true,
            modo: 'mock'
        };
    },

    async isSupabaseAvailable() {
        return false;
    },

    saveToLocalStorage(data) {
        console.log('🧪 [MOCK] saveToLocalStorage', data);
        return data;
    },

    // Add specific function for fetching questions which is usually done via supabase-service or direct fetch
    async getTestWithQuestions(testId) {
        console.log(`🧪 [MOCK] getTestWithQuestions for test ${testId}`);
        const test = mockTests.find(t => t.id === Number(testId));
        if (!test) return null;

        return {
            ...test,
            preguntas: mockQuestionsMap[testId] || []
        };
    }
};
