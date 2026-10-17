import { jest } from '@jest/globals';

const saveProgress = jest.fn();
const completeTest = jest.fn();
const getTestWithQuestions = jest.fn();
const saveResult = jest.fn();
const resolveProgressReference = jest.fn((id, revision) => ({ id, revision }));
jest.unstable_mockModule('../src/services/dataService.js', () => ({
    default: { provider: 'sqlite', resolveProgressReference }, saveProgress, completeTest, getTestWithQuestions
}));
jest.unstable_mockModule('../src/services/storage.js', () => ({ saveResult }));
jest.unstable_mockModule('../src/ui/testRenderer.js', () => ({ default: {
    renderQuestions: jest.fn(), updateViewModeUI: jest.fn(), displayResult: jest.fn()
} }));
jest.unstable_mockModule('../src/core/testEngine.js', () => ({ default: {
    evaluate: jest.fn(() => ({ aciertos: 1, total: 2, score: 50, errores: 0, blancos: 1, detalle: [] }))
} }));

const { default: StateManager } = await import('../src/core/stateManager.js');
const { loadTestWithProgress, saveAnswer, gradeTest, pauseAutoSave } = await import('../src/core/test.js');
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

describe('Progress snapshots and revisions', () => {
    beforeEach(async () => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        resolveProgressReference.mockImplementation((id, revision) => ({ id, revision }));
        StateManager.reset();
        document.body.innerHTML = '<h2 id="test-title"></h2><div id="tests-list"></div><div id="test-view"></div><div id="save-indicator-container"></div>';
        getTestWithQuestions.mockResolvedValue({ id: 1, titulo: 'Tema', preguntas: [{}, {}] });
        await loadTestWithProgress(1, 'tema.json', { id: 91, revision: 1, answers_data: [null, null] });
    });
    afterEach(async () => { await pauseAutoSave(); jest.useRealTimers(); });

    test('overlapping saves retain snapshots and advance the acknowledged revision', async () => {
        let acknowledge;
        saveProgress.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
        saveProgress.mockImplementationOnce(async data => ({ ...data, revision: 3, syncStatus: 'synced' }));
        saveAnswer(0, 1);
        await jest.advanceTimersByTimeAsync(2000);
        saveAnswer(1, 2);
        await jest.advanceTimersByTimeAsync(2000);
        expect(saveProgress).toHaveBeenCalledTimes(1);
        expect(saveProgress.mock.calls[0][0]).toMatchObject({ id: 91, revision: 1, answers_data: [1, null] });
        acknowledge({ id: 91, revision: 2, syncStatus: 'synced' });
        await settle();
        expect(saveProgress).toHaveBeenCalledTimes(2);
        expect(saveProgress.mock.calls[1][0]).toMatchObject({ id: 91, revision: 2, answers_data: [1, 2] });
        expect(StateManager.get('currentProgressRevision')).toBe(3);
        expect(document.getElementById('save-indicator').textContent).toBe('Sincronizado');
    });

    test('grading waits for autosave and avoids the Supabase local history namespace', async () => {
        let acknowledge;
        saveProgress.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
        completeTest.mockImplementation(async data => ({ ...data, revision: 3, syncStatus: 'pending' }));
        saveAnswer(0, 1);
        await jest.advanceTimersByTimeAsync(2000);
        const grading = gradeTest();
        expect(completeTest).not.toHaveBeenCalled();
        acknowledge({ id: 91, revision: 2, syncStatus: 'synced' });
        await grading;
        expect(completeTest.mock.calls[0][0]).toMatchObject({ id: 91, revision: 2, answers_data: [1, null], total_correct: 1 });
        expect(saveResult).not.toHaveBeenCalled();
        expect(document.getElementById('save-indicator').textContent).toContain('este dispositivo');
    });

    test('a conflict preserves the session revision and displays an honest status', async () => {
        saveProgress.mockImplementation(async data => ({ ...data, syncStatus: 'conflict' }));
        saveAnswer(0, 1);
        await jest.advanceTimersByTimeAsync(2000);
        expect(StateManager.get('currentProgressRevision')).toBe(1);
        expect(StateManager.get('userResponses')).toEqual([1, null]);
        expect(document.getElementById('save-indicator').textContent).toContain('otro dispositivo');
    });

    test('the periodic timer does not rewrite an unchanged SQLite snapshot', async () => {
        saveProgress.mockImplementation(async data => ({ ...data, revision: 2, syncStatus: 'synced' }));
        saveAnswer(0, 1);
        await jest.advanceTimersByTimeAsync(2000);
        await jest.advanceTimersByTimeAsync(30000);
        expect(saveProgress).toHaveBeenCalledTimes(1);
        expect(StateManager.get('currentProgressRevision')).toBe(2);
    });

    test('a background acknowledgement resolves the next save of this session', async () => {
        saveProgress.mockImplementationOnce(async data => ({ ...data, syncStatus: 'pending' }));
        saveProgress.mockImplementationOnce(async data => ({ ...data, revision: 3, syncStatus: 'synced' }));
        saveAnswer(0, 1);
        await jest.advanceTimersByTimeAsync(2000);
        resolveProgressReference.mockImplementation((id, revision) => ({ id, revision: revision === 1 ? 2 : revision }));
        saveAnswer(1, 2);
        await jest.advanceTimersByTimeAsync(2000);
        expect(saveProgress.mock.calls[1][0]).toMatchObject({ id: 91, revision: 2, answers_data: [1, 2] });
        expect(StateManager.get('currentProgressRevision')).toBe(3);
    });
});
