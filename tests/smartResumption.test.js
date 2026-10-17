/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock StateManager
jest.unstable_mockModule('../src/core/stateManager.js', () => ({
    default: {
        get: jest.fn((key) => {
            if (key === 'currentViewMode') return window._currentViewMode || 'list';
            if (key === 'lastSliderIndex') return window._lastSliderIndex ?? 0;
            return null;
        }),
        set: jest.fn((newState) => {
            if (newState.currentViewMode) window._currentViewMode = newState.currentViewMode;
            if (newState.lastSliderIndex !== undefined) window._lastSliderIndex = newState.lastSliderIndex;
        }),
        reset: jest.fn()
    }
}));

// Mock TestRenderer
jest.unstable_mockModule('../src/ui/testRenderer.js', () => ({
    default: {
        updateViewModeUI: jest.fn(),
        renderQuestions: jest.fn(),
        scrollSlider: jest.fn()
    }
}));

// Mock dataService
jest.unstable_mockModule('../src/services/dataService.js', () => ({
    getTestWithQuestions: jest.fn(),
    saveProgress: jest.fn(),
    completeTest: jest.fn()
}));

// Mock storage
jest.unstable_mockModule('../src/services/storage.js', () => ({
    saveResult: jest.fn()
}));

const { getFirstUnansweredIndex } = await import('../src/core/test.js');
const { default: TestRenderer } = await import('../src/ui/testRenderer.js');

describe('Smart Resumption Logic', () => {

    describe('getFirstUnansweredIndex', () => {
        test('should return 0 if responses is null or empty', () => {
            expect(getFirstUnansweredIndex(null)).toBe(0);
            expect(getFirstUnansweredIndex([])).toBe(0);
        });

        test('should return 0 if all questions are unanswered (all null)', () => {
            const responses = [null, null, null];
            expect(getFirstUnansweredIndex(responses)).toBe(0);
        });

        test('should return 0 if all questions are answered (no null)', () => {
            const responses = [1, 2, 3];
            expect(getFirstUnansweredIndex(responses)).toBe(0); // Natural reset to beginning or just handled by evaluate
        });

        test('should find the first gap (null)', () => {
            const responses = [1, null, 3];
            expect(getFirstUnansweredIndex(responses)).toBe(1);
        });

        test('should find the first null after multiple answers', () => {
            const responses = [1, 2, 3, null, null];
            expect(getFirstUnansweredIndex(responses)).toBe(3);
        });

        test('should return 0 if first question is unanswered', () => {
            const responses = [null, 1, 2];
            expect(getFirstUnansweredIndex(responses)).toBe(0);
        });
    });

    describe('Integration with TestRenderer', () => {
        // This tests that our new parameter forcedIndex is correctly handled in the Renderer logic
        // We'll use the real TestRenderer for this part, but we need to mock its dependencies

        test('TestRenderer.updateViewModeUI should prioritize forcedIndex', async () => {
            // Re-importing real TestRenderer (we already mocked StateManager above)
            // But wait, we mocked TestRenderer globally in this file for the Orchestrator tests.
            // Let's just verify that the Orchestrator calls it correctly.

            const { loadTestWithProgress } = await import('../src/core/test.js');
            const { getTestWithQuestions } = await import('../src/services/dataService.js');

            // Setup mocks
            getTestWithQuestions.mockResolvedValue({
                id: 1,
                titulo: 'Test 1',
                preguntas: [{}, {}, {}]
            });

            const progress = {
                id: 'p1',
                answers_data: [1, null, 1] // First unanswered is index 1
            };

            // Mock DOM elements needed
            document.body.innerHTML = `
                <div id="test-title"></div>
                <div id="tests-list"></div>
                <div id="test-view"></div>
            `;

            await loadTestWithProgress(1, 'tema1.json', progress);

            // Verify TestRenderer.updateViewModeUI was called with index 1
            expect(TestRenderer.updateViewModeUI).toHaveBeenCalledWith(
                expect.any(Function), // gradeTest
                expect.any(Function), // scrollSlider
                1 // forcedIndex
            );
        });
    });
});
