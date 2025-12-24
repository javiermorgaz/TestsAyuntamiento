/**
 * assets/js/test.js - Orquestador de Tests (v3.0)
 * 
 * Este módulo coordina la lógica de negocio (TestEngine) y la 
 * interfaz de usuario (TestRenderer) utilizando el estado centralizado (StateManager).
 */

import StateManager from '@core/stateManager.js';
import TestEngine from '@core/testEngine.js';
import TestRenderer from '@ui/testRenderer.js';
import { saveProgress, completeTest, getTestWithQuestions } from '@services/dataService.js';
import { saveResult } from '@services/storage.js';

let autoSaveTimeout = null;

/**
 * Función para volver al listado de tests
 */
function returnToList() {
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
        // Usar el provider de dataService que automáticamente elige entre real y mock
        const testData = await getTestWithQuestions(testId, fileName);
        if (!testData) {
            console.error('Error: No se pudo cargar el test');
            return;
        }

        StateManager.set({ currentTest: testData });
        StateManager.initResponses(testData.preguntas.length);

        // UI Setup
        document.getElementById('test-title').textContent = testData.titulo;
        TestRenderer.renderQuestions(testData.preguntas, saveAnswer);
        TestRenderer.updateViewModeUI(gradeTest, scrollSlider);

        // Mostrar vista de test
        const testsListSection = document.getElementById('tests-list');
        const testView = document.getElementById('test-view');
        if (testsListSection) testsListSection.style.display = 'none';
        if (testView) testView.style.display = 'block';

        // Activar auto-guardado
        const intervalId = setInterval(autoSaveProgress, 30000);
        StateManager.set({ autoSaveInterval: intervalId });

    } catch (error) {
        console.error('Error al cargar el test:', error);
    }
}

/**
 * Carga un test con progreso anterior (usa el provider pattern)
 */
async function loadTestWithProgress(testId, fileName, progress) {
    try {
        // Usar el provider de dataService que automáticamente elige entre real y mock
        const testData = await getTestWithQuestions(testId, fileName);
        if (!testData) {
            console.error('Error: No se pudo cargar el test');
            return;
        }

        StateManager.set({
            currentTest: testData,
            currentProgressId: progress.id,
            userResponses: progress.answers_data
        });

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

        TestRenderer.updateViewModeUI(gradeTest, scrollSlider);

        // Activar auto-guardado
        const intervalId = setInterval(autoSaveProgress, 30000);
        StateManager.set({ autoSaveInterval: intervalId });

        console.log(`✅ Test restaurado con ${progress.answers_data.filter(r => r !== null).length}/${testData.preguntas.length} respuestas`);

    } catch (error) {
        console.error('Error al restaurar test:', error);
    }
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
    const progressId = StateManager.get('currentProgressId');

    if (!test || responses.filter(r => r !== null).length === 0) return;

    try {
        const result = await saveProgress({
            id: progressId,
            test_id: test.id,
            answers_data: responses,
            total_questions: test.preguntas.length
        });

        if (!progressId && result.id) {
            StateManager.set({ currentProgressId: result.id });
        }

        // Mostrar indicador visual
        showSaveIndicator();
    } catch (error) {
        console.error('Error al auto-guardar:', error);
    }
}

function showSaveIndicator() {
    const container = document.getElementById('save-indicator-container');
    if (!container) return;

    let indicator = document.getElementById('save-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.className = 'save-indicator';
        indicator.textContent = 'Guardado';
        container.appendChild(indicator);
    }

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
    const responses = StateManager.get('userResponses');
    const progressId = StateManager.get('currentProgressId');

    if (!test) return;

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
        await completeTest({
            id: progressId,
            test_id: test.id,
            total_correct: results.aciertos,
            total_questions: results.total,
            score_percentage: results.score,
            answers_data: responses
        });
    } catch (error) {
        console.error('Error al guardar resultado final:', error);
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
    saveResult(resultado);

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
    restartTest
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
