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
const StateManager = await import('../assets/js/stateManager.js');

describe('StateManager (State Management Tests)', () => {

    beforeEach(() => {
        // Reset state before each test
        StateManager.default.reset();
    });

    describe('get and set', () => {
        test('should store and retrieve state correctly', () => {
            const mockTest = { id: 1, titulo: 'Test 1' };

            StateManager.default.set({ currentTest: mockTest });

            const result = StateManager.default.get('currentTest');
            expect(result).toEqual(mockTest);
        });

        test('should update multiple properties at once', () => {
            StateManager.default.set({
                currentTest: { id: 1 },
                userResponses: [1, 2, 3],
                currentProgressId: 123
            });

            expect(StateManager.default.get('currentTest')).toEqual({ id: 1 });
            expect(StateManager.default.get('userResponses')).toEqual([1, 2, 3]);
            expect(StateManager.default.get('currentProgressId')).toBe(123);
        });
    });

    describe('reset', () => {
        test('should reset state completely', () => {
            // Set some data
            StateManager.default.set({
                currentTest: { id: 1 },
                userResponses: [1, 2, 3],
                currentProgressId: 123
            });

            // Reset
            StateManager.default.reset();

            // Verify all values are back to defaults
            expect(StateManager.default.get('currentTest')).toBeNull();
            expect(StateManager.default.get('userResponses')).toEqual([]);
            expect(StateManager.default.get('currentProgressId')).toBeNull();
            expect(StateManager.default.get('currentViewMode')).toBe('list');
        });

        test('should not leak data between tests', () => {
            // Test 1 data
            StateManager.default.set({
                currentTest: { id: 1, titulo: 'Test 1' },
                userResponses: [1, 2, 3]
            });

            // Reset
            StateManager.default.reset();

            // Test 2 data
            StateManager.default.set({
                currentTest: { id: 2, titulo: 'Test 2' },
                userResponses: [4, 5, 6]
            });

            // Verify no trace of Test 1
            const currentTest = StateManager.default.get('currentTest');
            expect(currentTest.id).toBe(2);
            expect(currentTest.titulo).toBe('Test 2');
            expect(StateManager.default.get('userResponses')).toEqual([4, 5, 6]);
        });
    });
});
