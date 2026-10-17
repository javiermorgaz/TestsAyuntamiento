/**
 * assets/js/test.js - Orquestador de Tests (v3.0)
 * 
 * Este módulo coordina la lógica de negocio (TestEngine) y la 
 * interfaz de usuario (TestRenderer) utilizando el estado centralizado (StateManager).
 */

import StateManager from '@core/stateManager.js';
import TestEngine from '@core/testEngine.js';
import TestRenderer from '@ui/testRenderer.js';
import * as dataAPI from '@services/dataService.js';
import { saveResult } from '@services/storage.js';

const { saveProgress, completeTest, getTestWithQuestions } = dataAPI;

let autoSaveTimeout = null;
let persistenceChain = Promise.resolve();
let testSession = 0;
let lastPersistedResponses = null;

// Saves carry a response snapshot; IDs and revisions advance only through
// earlier saves in this same session, never through a remote conflict.
function persistSnapshot(test, responses, completeData = null) {
    const session = testSession;
    const snapshot = [...responses];
    const snapshotKey = JSON.stringify(snapshot);
    const task = persistenceChain.then(async () => {
        if (session !== testSession || StateManager.get('currentTest') !== test) return;
        if (!completeData && dataAPI.default?.provider === 'sqlite' && snapshotKey === lastPersistedResponses) return;
        const reference = dataAPI.default?.resolveProgressReference?.(
            StateManager.get('currentProgressId'), StateManager.get('currentProgressRevision')
        ) ?? { id: StateManager.get('currentProgressId'), revision: StateManager.get('currentProgressRevision') };
        const payload = {
            ...reference,
            test_id: test.id,
            answers_data: snapshot,
            total_questions: test.preguntas.length,
            ...completeData
        };
        const result = await (completeData ? completeTest(payload) : saveProgress(payload));
        if (session === testSession && StateManager.get('currentTest') === test && result) {
            lastPersistedResponses = snapshotKey;
            StateManager.set({
                currentProgressId: result.id ?? payload.id,
                currentProgressRevision: result.revision ?? payload.revision
            });
            showSaveIndicator(result.syncStatus);
        }
        return result;
    });
    persistenceChain = task.catch(() => {});
    return task;
}

export async function pauseAutoSave() {
    testSession += 1;
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
    const interval = StateManager.get('autoSaveInterval');
    if (interval) clearInterval(interval);
    StateManager.set({ autoSaveInterval: null });
    await persistenceChain;
}

export function currentProgressDraft() {
    const test = StateManager.get('currentTest');
    if (!test) return null;
    return {
        test_id: test.id,
        titulo: test.titulo,
        id: StateManager.get('currentProgressId'),
        revision: StateManager.get('currentProgressRevision'),
        answers_data: [...StateManager.get('userResponses')],
        total_questions: test.preguntas.length
    };
}

/**
 * Función para volver al listado de tests
 */
async function returnToList() {
    await autoSaveProgress();

    // Limpiar auto-guardado periódico
    const autoSaveInterval = StateManager.get('autoSaveInterval');
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        StateManager.set({ autoSaveInterval: null });
    }

    // Limpiar timeout de guardado debounced
    if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = null;
    }

    // Resetear variables globales en StateManager
    StateManager.reset();
    TestRenderer.updateViewModeUI(gradeTest, scrollSlider);

    // Navegación UI
    const testsListSection = document.getElementById('tests-list');
    const testView = document.getElementById('test-view');
    const resultadoView = document.getElementById('result-view');
    const appFooter = document.getElementById('app-footer');

    if (testsListSection) testsListSection.style.display = 'block';
    if (testView) testView.style.display = 'none';
    if (resultadoView) resultadoView.style.display = 'none';
    if (appFooter) appFooter.style.display = 'block';

    window.scrollTo(0, 0);
    // Para asegurar un reset limpio y evitar circularidad con main.js, recargamos la página
    window.location.reload();
}

/**
 * Carga un test desde su archivo JSON (usa el provider pattern)
 */
async function loadTest(testId, fileName) {
    try {
        await pauseAutoSave();
        // Usar el provider de dataService que automáticamente elige entre real y mock
        const testData = await getTestWithQuestions(testId, fileName);
        if (!testData) {
            console.error('Error: No se pudo cargar el test');
            return;
        }

        StateManager.set({ currentTest: testData, currentProgressId: null, currentProgressRevision: null });
        StateManager.initResponses(testData.preguntas.length);
        lastPersistedResponses = JSON.stringify(StateManager.get('userResponses'));

        // UI Setup
        document.getElementById('test-title').textContent = testData.titulo;
        TestRenderer.renderQuestions(testData.preguntas, saveAnswer);
        // Activar auto-guardado
        const intervalId = setInterval(autoSaveProgress, 30000);
        StateManager.set({ autoSaveInterval: intervalId });

        // Posicionamiento inteligente: En test nuevo, empezar en el 0
        TestRenderer.updateViewModeUI(gradeTest, scrollSlider, 0);

    } catch (error) {
        console.error('Error al cargar el test:', error);
    }
}

/**
 * Carga un test con progreso anterior (usa el provider pattern)
 */
async function loadTestWithProgress(testId, fileName, progress) {
    try {
        await pauseAutoSave();
        // Usar el provider de dataService que automáticamente elige entre real y mock
        const testData = await getTestWithQuestions(testId, fileName);
        if (!testData) {
            console.error('Error: No se pudo cargar el test');
            return;
        }

        StateManager.set({
            currentTest: testData,
            currentProgressId: progress.id,
            currentProgressRevision: progress.revision ?? null,
            userResponses: [...progress.answers_data]
        });
        lastPersistedResponses = JSON.stringify(progress.answers_data);

        document.getElementById('test-title').textContent = testData.titulo;

        // Render y sincronización de UI
        TestRenderer.renderQuestions(testData.preguntas, saveAnswer);

        // Restaurar checks en la UI
        progress.answers_data.forEach((answer, index) => {
            if (answer !== null) {
                const input = document.querySelector(`input[name="pregunta-${index}"][value="${answer}"]`);
                if (input) input.checked = true;
            }
        });

        const testsListSection = document.getElementById('tests-list');
        const testView = document.getElementById('test-view');
        if (testsListSection) testsListSection.style.display = 'none';
        if (testView) testView.style.display = 'block';

        // Activar auto-guardado
        const intervalId = setInterval(autoSaveProgress, 30000);
        StateManager.set({ autoSaveInterval: intervalId });

        // Posicionamiento inteligente: Buscar primera pregunta sin contestar
        const firstUnanswered = getFirstUnansweredIndex(progress.answers_data);
        TestRenderer.updateViewModeUI(gradeTest, scrollSlider, firstUnanswered);

        console.log(`✅ Test restaurado con ${progress.answers_data.filter(r => r !== null).length}/${testData.preguntas.length} respuestas. Saltando a pregunta ${firstUnanswered + 1}`);

    } catch (error) {
        console.error('Error al restaurar test:', error);
    }
}

/**
 * Busca el índice de la primera pregunta sin contestar
 */
function getFirstUnansweredIndex(responses) {
    if (!responses) return 0;
    const index = responses.findIndex(answer => answer === null);
    return index !== -1 ? index : 0;
}

/**
 * Guarda la respuesta seleccionada por el usuario
 */
function saveAnswer(index, answer) {
    StateManager.setAnswer(index, answer);

    // Auto-guardado debounced
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(autoSaveProgress, 2000);
}

/**
 * Auto-guarda el progreso actual
 */
async function autoSaveProgress() {
    const test = StateManager.get('currentTest');
    const responses = StateManager.get('userResponses');

    if (!test || responses.filter(r => r !== null).length === 0) return;

    try {
        await persistSnapshot(test, responses);
    } catch (error) {
        console.error('Error al auto-guardar:', error);
        showSaveIndicator('error');
    }
}

function showSaveIndicator(status) {
    const container = document.getElementById('save-indicator-container');
    if (!container) return;

    let indicator = document.getElementById('save-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.className = 'save-indicator';
        container.appendChild(indicator);
    }
    indicator.textContent = ({
        synced: 'Sincronizado',
        pending: 'Guardado en este dispositivo',
        conflict: 'Cambios en otro dispositivo',
        error: 'No se pudo guardar'
    })[status] || 'Guardado';
    if (status) indicator.dataset.syncStatus = status;
    else delete indicator.dataset.syncStatus;
    indicator.setAttribute('role', 'status');

    // Mostrar usando la clase CSS show
    requestAnimationFrame(() => {
        indicator.classList.add('show');
    });

    // Ocultar después de 2 segundos
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2000);
}

/**
 * Corrige el test y muestra resultados
 */
async function gradeTest() {
    const test = StateManager.get('currentTest');
    const responses = [...StateManager.get('userResponses')];

    if (!test) return;
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;

    // Limpiar auto-guardado
    const autoSaveInterval = StateManager.get('autoSaveInterval');
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        StateManager.set({ autoSaveInterval: null });
    }

    // 1. Evaluar logicamente
    const results = TestEngine.evaluate(test.preguntas, responses);

    // 2. Persistir en persistencia
    try {
        await persistSnapshot(test, responses, {
            total_correct: results.aciertos,
            score_percentage: results.score
        });
    } catch (error) {
        console.error('Error al guardar resultado final:', error);
        showSaveIndicator('error');
    }

    // Guardar en localStorage como backup
    const resultado = {
        testId: test.id,
        titulo: test.titulo,
        fecha: new Date().toISOString(),
        aciertos: results.aciertos,
        errores: results.errores,
        blancos: results.blancos,
        total: results.total,
        respuestas: [...responses],
        detalle: results.detalle
    };
    if (dataAPI.default?.provider !== 'sqlite') saveResult(resultado);

    // 3. Renderizar resultados
    TestRenderer.displayResult(results, test.titulo);
}

/**
 * Cambia el modo de visualización
 */
function toggleViewMode() {
    const current = StateManager.get('currentViewMode');
    const next = current === 'list' ? 'slider' : 'list';
    StateManager.set({ currentViewMode: next });
    TestRenderer.updateViewModeUI(gradeTest, scrollSlider);
}

/**
 * Desplaza el slider
 */
function scrollSlider(direction) {
    TestRenderer.scrollSlider(direction);
}

function restartTest() {
    window.location.reload();
}

// Inicialización de Listeners
function initEventListeners() {
    const btnToggle = document.getElementById('view-mode-toggle');
    if (btnToggle) btnToggle.addEventListener('click', toggleViewMode);

    const btnFinish = document.getElementById('btn-finish');
    if (btnFinish) btnFinish.addEventListener('click', gradeTest);

    const btnBackHome = document.getElementById('btn-back-home');
    if (btnBackHome) btnBackHome.addEventListener('click', returnToList);

    const btnBackHomeResult = document.getElementById('btn-back-home-result');
    if (btnBackHomeResult) btnBackHomeResult.addEventListener('click', returnToList);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEventListeners);
} else {
    initEventListeners();
}

// Exportaciones para compatibilidad temporal con window (se eliminarán en 4.3)


export {
    loadTest,
    loadTestWithProgress,
    returnToList,
    toggleViewMode,
    gradeTest,
    saveAnswer,
    scrollSlider,
    restartTest,
    getFirstUnansweredIndex
};

// Funciones auxiliares expuestas para tests
export function getCurrentQuestionIndexInListMode() {
    return TestRenderer.getCurrentQuestionIndexInListMode();
}
export function updateViewModeUI() {
    return TestRenderer.updateViewModeUI(gradeTest, scrollSlider);
}
export function renderAllQuestions(questions) {
    return TestRenderer.renderQuestions(questions, saveAnswer);
}
