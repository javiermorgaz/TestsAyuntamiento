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
jest.unstable_mockModule('../src/services/supabase-service.js', () => ({
    fetchTestsFromSupabase: jest.fn(),
    fetchTestById: jest.fn(),
    fetchTestInProgress: jest.fn(),
    saveTestProgress: jest.fn(),
    completeTestSupabase: jest.fn(),
    fetchTestHistory: jest.fn(),
    fetchAllResults: jest.fn(),
    deleteTestProgress: jest.fn(),
    fetchAllTestProgress: jest.fn()
}));

jest.unstable_mockModule('../src/config/supabase.js', () => ({
    getSupabaseClient: jest.fn()
}));

jest.unstable_mockModule('../src/services/storage.js', () => ({
    getResults: jest.fn(),
    saveResult: jest.fn(),
    getTestResults: jest.fn(),
    clearResults: jest.fn(),
    saveProgress: jest.fn(),
    getProgress: jest.fn(),
    getAllProgress: jest.fn(),
    deleteProgress: jest.fn()
}));

// Import the mocks
const {
    fetchTestsFromSupabase,
    fetchTestInProgress,
    saveTestProgress,
    completeTestSupabase,
    fetchAllTestProgress,
    deleteTestProgress
} = await import('../src/services/supabase-service.js');
const { getSupabaseClient } = await import('../src/config/supabase.js');
const {
    getResults,
    saveResult,
    saveProgress: saveLocalProgress,
    getProgress: getLocalProgress,
    getAllProgress: getAllLocalProgress,
    deleteProgress: deleteLocalProgress
} = await import('../src/services/storage.js');

// Import the module under test (testing the real implementation specifically)
const dataService = await import('../src/services/realDataService.js');

describe('Data Service (Unit Tests)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        getSupabaseClient.mockResolvedValue(null);
        getResults.mockReturnValue([]);
        getLocalProgress.mockReturnValue(null);
        getAllLocalProgress.mockReturnValue([]);
        deleteLocalProgress.mockReturnValue(false);
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
        const mockData = { test_id: 1, answers_data: [1, 2], total_questions: 2 };

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
            const savedProgress = {
                id: now,
                ...mockData,
                status: 'in_progress'
            };
            saveLocalProgress.mockReturnValue(savedProgress);

            const result = await dataService.saveProgress(mockData);

            expect(saveTestProgress).not.toHaveBeenCalled();
            expect(saveLocalProgress).toHaveBeenCalledWith({
                id: now,
                ...mockData,
                status: 'in_progress'
            });
            expect(result).toEqual(savedProgress);
        });
    });

    describe('findTestProgress', () => {
        test('should return progress from Supabase if available', async () => {
            getSupabaseClient.mockResolvedValue({});
            const mockProgress = { id: 10, test_id: 1, answers_data: [1, null] };
            fetchTestInProgress.mockResolvedValue(mockProgress);

            const result = await dataService.findTestProgress(1);

            expect(fetchTestInProgress).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockProgress);
        });

        test('should not use local progress when Supabase has no progress', async () => {
            getSupabaseClient.mockResolvedValue({});
            fetchTestInProgress.mockResolvedValue(null);
            getLocalProgress.mockReturnValue({ id: 10, test_id: 1, answers_data: [1, null] });

            const result = await dataService.findTestProgress(1);

            expect(fetchTestInProgress).toHaveBeenCalledWith(1);
            expect(getLocalProgress).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        test('should fallback to local progress when offline', async () => {
            const mockProgress = { id: 10, test_id: 1, answers_data: [1, null] };
            getLocalProgress.mockReturnValue(mockProgress);

            const result = await dataService.findTestProgress(1);

            expect(fetchTestInProgress).not.toHaveBeenCalled();
            expect(getLocalProgress).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockProgress);
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

        test('should remove local in-progress entry when finalizing offline', async () => {
            getSupabaseClient.mockResolvedValue(null);

            await dataService.completeTest({ ...mockResultData, id: 123 });

            expect(deleteLocalProgress).toHaveBeenCalledWith(123);
            expect(saveResult).toHaveBeenCalled();
        });
    });

    describe('fetchAllProgress', () => {
        test('should return progress from Supabase if available', async () => {
            getSupabaseClient.mockResolvedValue({});
            const mockProgress = [{ test_id: 1, answers_data: [] }];
            fetchAllTestProgress.mockResolvedValue(mockProgress);

            const result = await dataService.fetchAllProgress();

            expect(fetchAllTestProgress).toHaveBeenCalled();
            expect(result).toEqual(mockProgress);
        });

        test('should not use local progress when Supabase returns an empty list', async () => {
            getSupabaseClient.mockResolvedValue({});
            fetchAllTestProgress.mockResolvedValue([]);
            getAllLocalProgress.mockReturnValue([{ id: 10, test_id: 1, answers_data: [1, null] }]);

            const result = await dataService.fetchAllProgress();

            expect(fetchAllTestProgress).toHaveBeenCalled();
            expect(getAllLocalProgress).not.toHaveBeenCalled();
            expect(result).toEqual([]);
        });

        test('should return local progress when offline', async () => {
            const mockProgress = [{ id: 10, test_id: 1, answers_data: [1, null] }];
            getAllLocalProgress.mockReturnValue(mockProgress);

            const result = await dataService.fetchAllProgress();

            expect(fetchAllTestProgress).not.toHaveBeenCalled();
            expect(getAllLocalProgress).toHaveBeenCalled();
            expect(result).toEqual(mockProgress);
        });
    });

    describe('deleteProgress', () => {
        test('should delete from Supabase if available', async () => {
            getSupabaseClient.mockResolvedValue({});
            deleteTestProgress.mockResolvedValue(true);

            const result = await dataService.deleteProgress(123);

            expect(deleteTestProgress).toHaveBeenCalledWith(123);
            expect(result).toBe(true);
        });

        test('should delete local progress when offline', async () => {
            deleteLocalProgress.mockReturnValue(true);

            const result = await dataService.deleteProgress(123);

            expect(deleteTestProgress).not.toHaveBeenCalled();
            expect(deleteLocalProgress).toHaveBeenCalledWith(123);
            expect(result).toBe(true);
        });
    });
});
