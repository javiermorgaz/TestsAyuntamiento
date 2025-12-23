/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock console
global.console = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
};

// Mock Supabase client dependency (as a module)
jest.unstable_mockModule('../src/services/supabase-config.js', () => ({
    getSupabaseClient: jest.fn()
}));

// Import the mocks and then the module under test
const { getSupabaseClient } = await import('../src/services/supabase-config.js');
const supabaseService = await import('../src/services/supabase-service.js');

describe('Supabase Service (Unit Tests)', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('fetchTestsFromSupabase', () => {
        test('should return data on success', async () => {
            const mockData = [{ id: 1, titulo: 'Test Supabase' }];

            const mockOrder = {
                order: jest.fn().mockResolvedValue({ data: mockData, error: null })
            };
            const mockSelect = {
                select: jest.fn().mockReturnValue(mockOrder)
            };
            const mockClient = {
                from: jest.fn().mockReturnValue(mockSelect)
            };

            getSupabaseClient.mockResolvedValue(mockClient);

            const result = await supabaseService.fetchTestsFromSupabase();

            expect(mockClient.from).toHaveBeenCalledWith('tests');
            expect(result).toEqual(mockData);
        });
    });

    describe('saveTestProgress', () => {
        test('should call insert when no ID is provided', async () => {
            const mockProgress = { test_id: 1, answers_data: [1, null] };

            const mockSingle = {
                single: jest.fn().mockResolvedValue({ data: { id: 123 }, error: null })
            };
            const mockSelect = {
                select: jest.fn().mockReturnValue(mockSingle)
            };
            const mockInsert = {
                insert: jest.fn().mockReturnValue(mockSelect)
            };
            const mockClient = {
                from: jest.fn().mockReturnValue(mockInsert)
            };

            getSupabaseClient.mockResolvedValue(mockClient);

            const result = await supabaseService.saveTestProgress(mockProgress);

            expect(mockClient.from).toHaveBeenCalledWith('results');
            expect(result).toEqual({ id: 123 });
        });

        test('should insert with correct schema fields', async () => {
            const mockProgress = { test_id: 1, answers_data: [1, 2], total_questions: 10 };

            const mockSingle = {
                single: jest.fn().mockResolvedValue({ data: { id: 123 }, error: null })
            };
            const mockSelect = {
                select: jest.fn().mockReturnValue(mockSingle)
            };
            const mockInsert = {
                insert: jest.fn().mockReturnValue(mockSelect)
            };
            const mockClient = {
                from: jest.fn().mockReturnValue(mockInsert)
            };

            getSupabaseClient.mockResolvedValue(mockClient);

            await supabaseService.saveTestProgress(mockProgress);

            expect(mockInsert.insert).toHaveBeenCalledWith(expect.objectContaining({
                test_id: 1,
                status: 'in_progress',
                answers_data: [1, 2],
                total_questions: 10
            }));
        });
    });

    describe('fetchTestInProgress', () => {
        test('should query results table with correct filters', async () => {
            const mockData = [{ id: 1, test_id: 123, answers_data: [] }];

            const mockLimit = {
                limit: jest.fn().mockResolvedValue({ data: mockData, error: null })
            };
            const mockOrder = {
                order: jest.fn().mockReturnValue(mockLimit)
            };
            const mockEq = {
                eq: jest.fn().mockReturnValue(mockOrder)
            };
            const mockSelect = {
                select: jest.fn().mockReturnValue(mockEq)
            };
            const mockClient = {
                from: jest.fn().mockReturnValue(mockSelect)
            };

            getSupabaseClient.mockResolvedValue(mockClient);

            const result = await supabaseService.fetchTestInProgress(123);

            expect(mockClient.from).toHaveBeenCalledWith('results');
            expect(mockSelect.select).toHaveBeenCalledWith('*');
            expect(mockEq.eq).toHaveBeenCalledWith('test_id', 123);
            expect(mockOrder.order).toHaveBeenCalledWith('id', { ascending: false });
            expect(result).toEqual(mockData[0]);
        });
    });

    describe('completeTestSupabase', () => {
        test('should update with completed status', async () => {
            const mockResult = {
                id: 55,
                score_percentage: 80,
                total_correct: 8,
                total_questions: 10,
                answers_data: [1, 2]
            };

            const mockSingle = {
                single: jest.fn().mockResolvedValue({ data: { id: 55 }, error: null })
            };
            const mockSelect = {
                select: jest.fn().mockReturnValue(mockSingle)
            };
            const mockEq = {
                eq: jest.fn().mockReturnValue(mockSelect)
            };
            const mockUpdate = {
                update: jest.fn().mockReturnValue(mockEq)
            };
            const mockClient = {
                from: jest.fn().mockReturnValue(mockUpdate)
            };

            getSupabaseClient.mockResolvedValue(mockClient);

            await supabaseService.completeTestSupabase(mockResult);

            expect(mockClient.from).toHaveBeenCalledWith('results');
            expect(mockUpdate.update).toHaveBeenCalledWith(expect.objectContaining({
                status: 'in_progress',
                score_percentage: 80,
                total_correct: 8
            }));
            expect(mockEq.eq).toHaveBeenCalledWith('id', 55);
        });
    });
});
