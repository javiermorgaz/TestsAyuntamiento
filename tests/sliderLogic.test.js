/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock necessary globals before importing
global.innerHeight = 1000;

document.body.innerHTML = `
    <div id="test-view"></div>
    <div id="result-view"></div>
    <div id="questions-container"></div>
    <form id="questions-form"></form>
`;

window.scrollTo = jest.fn();
window.scrollBy = jest.fn();

// We mock StateManager because TestRenderer uses it
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

// Mock scrollY manually since it's read-only in jsdom
Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

// Import the module under test (TestRenderer)
const { default: TestRenderer } = await import('../src/ui/testRenderer.js');

describe('TestRenderer - Slider Logic (Unit Tests)', () => {
    let questionsContainer;

    beforeEach(() => {
        jest.clearAllMocks();
        questionsContainer = document.getElementById('questions-container');
        questionsContainer.innerHTML = '';
        global.innerHeight = 1000;
        window.scrollY = 200; // Trigger logic path > 150
    });

    describe('getCurrentQuestionIndexInListMode', () => {
        test('should return 0 when no questions exist', () => {
            expect(TestRenderer.getCurrentQuestionIndexInListMode()).toBe(0);
        });

        test('should identify the correct question based on focusPoint', () => {
            const q1 = document.createElement('div');
            q1.id = 'pregunta-0';
            const q2 = document.createElement('div');
            q2.id = 'pregunta-1';

            questionsContainer.appendChild(q1);
            questionsContainer.appendChild(q2);

            // focusPoint = 500
            q1.getBoundingClientRect = () => ({ top: -400, bottom: 400, height: 800 });
            q2.getBoundingClientRect = () => ({ top: 400, bottom: 1200, height: 800 });

            expect(TestRenderer.getCurrentQuestionIndexInListMode()).toBe(1);
        });

        test('should return last question if all are above focusPoint', () => {
            const q1 = document.createElement('div');
            q1.id = 'pregunta-0';
            questionsContainer.appendChild(q1);

            q1.getBoundingClientRect = () => ({ top: -1000, bottom: -200, height: 800 });

            expect(TestRenderer.getCurrentQuestionIndexInListMode()).toBe(0);
        });
    });

    describe('Slider Navigation', () => {
        test('scrollSlider should call questionsContainer.scrollTo with correct position', () => {
            const q1 = document.createElement('div');
            q1.id = 'pregunta-0';
            const q2 = document.createElement('div');
            q2.id = 'pregunta-1';

            questionsContainer.appendChild(q1);
            questionsContainer.appendChild(q2);

            // Mock offsetLeft/offsetWidth
            Object.defineProperty(q1, 'offsetLeft', { value: 0 });
            Object.defineProperty(q2, 'offsetLeft', { value: 500 });
            Object.defineProperty(questionsContainer, 'offsetWidth', { value: 500 });

            // Mock scrollTo (the new function used by scrollSlider)
            questionsContainer.scrollTo = jest.fn();

            // Reset slider state
            window._lastSliderIndex = 0;
            TestRenderer._sliderTotalItems = 2; // Must set this for setActiveIndex to work

            TestRenderer.scrollSlider(1);

            // After scrollSlider(1), the new index is 1, so scrollTo should be called with left: 1 * 500 = 500
            expect(questionsContainer.scrollTo).toHaveBeenCalledWith(expect.objectContaining({
                left: 500,
                behavior: 'smooth'
            }));
        });
    });
});
