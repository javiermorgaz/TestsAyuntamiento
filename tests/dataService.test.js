/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock console
global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock dependencies as modules
jest.unstable_mockModule('../assets/js/supabase-service.js', () => ({
    getSupabaseClient: jest.fn(),
    fetchTestsFromSupabase: jest.fn(),
    fetchTestById: jest.fn(),
    fetchTestInProgress: jest.fn(),
    saveTestProgress: jest.fn(),
    completeTestSupabase: jest.fn(),
    fetchTestHistory: jest.fn(),
    fetchAllResults: jest.fn(),
    deleteTestProgress: jest.fn()
}));

jest.unstable_mockModule('../assets/js/storage.js', () => ({
    getResults: jest.fn(),
    saveResult: jest.fn(),
    getTestResults: jest.fn(),
    clearResults: jest.fn()
}));

// Import the mocks
const {
    getSupabaseClient,
    fetchTestsFromSupabase,
    fetchTestInProgress,
    saveTestProgress,
    completeTestSupabase
} = await import('../assets/js/supabase-service.js');
const { getResults, saveResult } = await import('../assets/js/storage.js');

// Import the module under test
const dataService = await import('../assets/js/dataService.js');

describe('Data Service (Unit Tests)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        getSupabaseClient.mockResolvedValue(null);
        getResults.mockReturnValue([]);
    });

    describe('isSupabaseAvailable', () => {
        test('should return true when client is available', async () => {
            getSupabaseClient.mockResolvedValue({ supabaseKey: 'test-key' });
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(true);
        });

        test('should return false when client is null', async () => {
            getSupabaseClient.mockResolvedValue(null);
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(false);
        });

        test('should handle Supabase client initialization errors gracefully', async () => {
            getSupabaseClient.mockRejectedValue(new Error('Config error'));
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(false);
        });
    });

    describe('fetchTests', () => {
        test('should fetch from Supabase if available', async () => {
            getSupabaseClient.mockResolvedValue({});
            const mockTests = [{ id: 1, title: 'Test 1' }];
            fetchTestsFromSupabase.mockResolvedValue(mockTests);

            const result = await dataService.fetchTests();

            expect(result).toEqual(mockTests);
        });

        test('should fallback to local file if Supabase fails', async () => {
            getSupabaseClient.mockResolvedValue({});
            fetchTestsFromSupabase.mockRejectedValue(new Error('Network error'));

            const mockLocalTests = [{ id: 2, title: 'Local Test' }];
            global.fetch = jest.fn().mockResolvedValue({
                json: () => Promise.resolve(mockLocalTests)
            });

            const result = await dataService.fetchTests();

            expect(global.fetch).toHaveBeenCalledWith('./data/tests_index.json');
            expect(result).toEqual(mockLocalTests);
        });
    });

    describe('saveProgress', () => {
        const mockData = { test_id: 1, answers_data: [1, 2] };

        test('should save to Supabase if available', async () => {
            getSupabaseClient.mockResolvedValue({});
            saveTestProgress.mockResolvedValue({ id: 123 });

            const result = await dataService.saveProgress(mockData);

            expect(result).toEqual({ id: 123 });
        });

        test('should save to localStorage when offline', async () => {
            getSupabaseClient.mockResolvedValue(null);

            const now = 1234567890;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const result = await dataService.saveProgress(mockData);

            expect(saveTestProgress).not.toHaveBeenCalled();
            expect(result).toEqual({
                id: now,
                ...mockData,
                status: 'in_progress'
            });
        });
    });

    describe('completeTest', () => {
        const mockResultData = {
            test_id: 1,
            total_correct: 5,
            total_questions: 10,
            answers_data: [1, 2]
        };

        test('should save to BOTH Supabase and localStorage if online', async () => {
            getSupabaseClient.mockResolvedValue({});
            completeTestSupabase.mockResolvedValue({ id: 999 });

            await dataService.completeTest(mockResultData);

            expect(completeTestSupabase).toHaveBeenCalledWith(mockResultData);
            expect(saveResult).toHaveBeenCalled();
        });

        test('should save ONLY to localStorage if offline', async () => {
            getSupabaseClient.mockResolvedValue(null);

            await dataService.completeTest(mockResultData);

            expect(completeTestSupabase).not.toHaveBeenCalled();
            expect(saveResult).toHaveBeenCalled();

            const savedData = saveResult.mock.calls[0][0];
            expect(savedData).toEqual(expect.objectContaining({
                testId: 1,
                aciertos: 5,
                errores: 5
            }));
        });
    });
});
