/**
 * @jest-environment jsdom
 */

// Mock globals required by dataService.js
global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

// Mock dependencies (global functions)
global.getSupabaseClient = jest.fn();
global.fetchTestsFromSupabase = jest.fn();
global.fetchTestHistory = jest.fn();
global.fetchTestInProgress = jest.fn();
global.saveTestProgress = jest.fn();
global.deleteTestProgress = jest.fn();
global.completeTestSupabase = jest.fn();
global.getResults = jest.fn();
global.saveResult = jest.fn();

// Import the module under test
const dataService = require('../assets/js/dataService.js');

describe('Data Service (Unit Tests)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset default mock implementations
        global.getSupabaseClient.mockResolvedValue(null); // Default: Offline
        global.getResults.mockReturnValue([]);
    });

    describe('isSupabaseAvailable', () => {
        test('should return true when client is available', async () => {
            global.getSupabaseClient.mockResolvedValue({ supabaseKey: 'test-key' });
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(true);
        });

        test('should return false when client is null', async () => {
            global.getSupabaseClient.mockResolvedValue(null);
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(false);
        });

        test('should return false when getSupabaseClient throws', async () => {
            global.getSupabaseClient.mockRejectedValue(new Error('Config error'));
            const result = await dataService.isSupabaseAvailable();
            expect(result).toBe(false);
        });
    });

    describe('fetchTests', () => {
        test('should fetch from Supabase if available', async () => {
            // Setup
            global.getSupabaseClient.mockResolvedValue({});
            const mockTests = [{ id: 1, title: 'Test 1' }];
            global.fetchTestsFromSupabase.mockResolvedValue(mockTests);

            // Execute
            const result = await dataService.fetchTests();

            // Verify
            expect(global.fetchTestsFromSupabase).toHaveBeenCalled();
            expect(result).toEqual(mockTests);
        });

        test('should fallback to local file if Supabase fails', async () => {
            // Setup mocks
            global.getSupabaseClient.mockResolvedValue({});
            global.fetchTestsFromSupabase.mockRejectedValue(new Error('Network error'));

            // Mock fetch for local JSON
            const mockLocalTests = [{ id: 2, title: 'Local Test' }];
            global.fetch = jest.fn().mockResolvedValue({
                json: () => Promise.resolve(mockLocalTests)
            });

            // Execute
            const result = await dataService.fetchTests();

            // Verify
            expect(global.fetch).toHaveBeenCalledWith('./data/tests_index.json');
            expect(result).toEqual(mockLocalTests);
        });
    });

    describe('saveProgress', () => {
        const mockData = { test_id: 1, answers_data: [1, 2] };

        test('should save to Supabase if available', async () => {
            global.getSupabaseClient.mockResolvedValue({});
            global.saveTestProgress.mockResolvedValue({ id: 123 });

            const result = await dataService.saveProgress(mockData);

            expect(global.saveTestProgress).toHaveBeenCalledWith(mockData);
            expect(result).toEqual({ id: 123 });
        });

        test('should save locally if offline (fallback)', async () => {
            global.getSupabaseClient.mockResolvedValue(null);

            // Mock Date.now for predictable ID
            const now = 123456789;
            jest.spyOn(Date, 'now').mockReturnValue(now);

            const result = await dataService.saveProgress(mockData);

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
            global.getSupabaseClient.mockResolvedValue({});
            global.completeTestSupabase.mockResolvedValue({ id: 999 });

            await dataService.completeTest(mockResultData);

            expect(global.completeTestSupabase).toHaveBeenCalledWith(mockResultData);
            // Verify it ALSO saved to localStorage as backup
            expect(global.saveResult).toHaveBeenCalled();
        });

        test('should save ONLY to localStorage if offline', async () => {
            global.getSupabaseClient.mockResolvedValue(null);

            await dataService.completeTest(mockResultData);

            expect(global.completeTestSupabase).not.toHaveBeenCalled();
            expect(global.saveResult).toHaveBeenCalled();

            // Check argument to saveResult (transformed data)
            const expectedLocalSave = expect.objectContaining({
                testId: 1,
                aciertos: 5,
                errores: 5,
                respuestas: [1, 2]
            });
            expect(global.saveResult).toHaveBeenCalledWith(expectedLocalSave);
        });
    });

});
