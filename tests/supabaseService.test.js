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
jest.unstable_mockModule('../assets/js/supabase-config.js', () => ({
    getSupabaseClient: jest.fn()
}));

// Import the mocks and then the module under test
const { getSupabaseClient } = await import('../assets/js/supabase-config.js');
const supabaseService = await import('../assets/js/supabase-service.js');

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
    });
});
