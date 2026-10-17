// assets/js/main.js
import pkg from '../../package.json';
import dataService, { fetchTests, findTestProgress, fetchAllProgress, deleteProgress } from '@services/dataService.js';
import { showConfirm, showModal } from '@ui/modal.js';
import { loadTest, loadTestWithProgress, pauseAutoSave, currentProgressDraft } from '@core/test.js';
import { initSQLiteSync } from './sqliteSync.js';

const testsListSection = document.getElementById('tests-list');
const testsContainer = document.getElementById('tests-container');

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

/**
 * Actualiza la información de la versión y fecha de forma dinámica
 */
async function updateAppVersionInfo() {
    const versionEl = document.getElementById('app-version');
    const dateEl = document.getElementById('app-date');

    if (dateEl) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        dateEl.textContent = `${day}/${month}/${year}`;
    }

    try {
        if (versionEl && pkg) {
            versionEl.textContent = `Versión ${pkg.version}`;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo cargar la versión:', error);
        if (versionEl) versionEl.textContent = 'Versión (N/D)';
    }
}

/**
 * Carga el archivo de índice de tests y llama a la función de renderizado.
 */
async function loadTestsList() {
    try {
        testsContainer.innerHTML = `
            <div class="col-span-full" id="loading-state">
                <p class="text-white drop-shadow-lg text-center text-2xl md:text-3xl font-light mb-8 animate-pulse" style="color: #ffffff;">Cargando tests...</p>
                <div class="space-y-6">
                    ${[1, 2, 3, 4].map(() => `
                        <div class="glass-card p-6 animate-pulse skeleton-card">
                            <div class="h-6 bg-white/30 rounded w-3/4 mb-4 dark:bg-gray-700/50"></div>
                            <div class="h-4 bg-white/20 rounded w-1/2 mb-6 dark:bg-gray-700/30"></div>
                            <div class="h-12 bg-white/25 rounded dark:bg-gray-700/40"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        console.log("🔗 [UI] Llamando a fetchTests()...");
        const tests = await fetchTests();
        console.log(`✅ [UI] Tests recibidos: ${tests?.length || 0}`);
        await renderTestsList(tests);

    } catch (error) {
        console.error("Error crítico al cargar listado:", error);
        testsContainer.innerHTML =
            '<p class="text-white text-center bg-red-500/20 p-4 rounded-lg border border-red-500/50">⚠️ No se pudieron cargar los tests. Revisa la consola.</p>';
    }
}

/**
 * Genera el HTML para mostrar la lista de tests disponibles.
 */
async function renderTestsList(tests) {
    if (tests.length === 0) {
        testsContainer.innerHTML = '<p class="text-white text-center">No hay tests disponibles.</p>';
        return;
    }

    // --- OPTIMIZACIÓN DE RENDIMIENTO ---
    // En lugar de hacer 1 petición por test (N+1), hacemos 1 petición batch
    const allProgress = await fetchAllProgress();

    // Crear mapa de acceso rápido: testId -> progressData
    const progressMap = new Map();
    if (allProgress) {
        allProgress.forEach(p => {
            if (!progressMap.has(p.test_id)) progressMap.set(p.test_id, p);
        });
    }

    let htmlContent = '';
    const itemsData = [];

    for (const test of tests) {
        const safeId = escapeHTML(test.id);
        const safeFile = escapeHTML(test.fichero);
        // Usar mapa en memoria en lugar de await secuencial
        const progress = progressMap.get(test.id);

        let progressHTML = '';
        let buttonsHTML = '';

        if (progress) {
            const answeredCount = progress.answers_data.filter(a => a !== null).length;
            const percentage = Math.round((answeredCount / progress.total_questions) * 100);

            progressHTML = `
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-900 dark:text-gray-100">📝 En progreso</span>
                        <span class="text-sm font-semibold text-primary">${answeredCount}/${progress.total_questions}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div class="bg-gradient-to-r from-accent to-green-600 h-2.5 rounded-full" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;

            buttonsHTML = `
                <div class="flex gap-3 flex-col sm:flex-row">
                    <button class="btn-start-test flex-1 bg-gradient-to-r from-accent to-green-600 text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${safeId}" data-file="${safeFile}">
                        ▶️ Continuar Test
                    </button>
                    <button class="btn-reset-test flex-1 bg-gradient-to-r from-reset to-orange-600 text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${safeId}" data-file="${safeFile}">
                        🔄 Empezar de Nuevo
                    </button>
                </div>
            `;
        } else {
            buttonsHTML = `
                <button class="btn-start-test w-full bg-gradient-to-r from-primary to-secondary text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${safeId}" data-file="${safeFile}">
                    🚀 Comenzar Test
                </button>
            `;
        }

        htmlContent += `
            <div class="glass-card p-6 hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <h3 class="text-base font-bold text-dark mb-2">${escapeHTML(test.titulo)}</h3>
                <p class="text-sm text-gray-700 mb-4 flex items-center gap-2 dark:text-gray-300">
                    <span class="text-xl">📋</span>
                    <span>${test.num_preguntas} preguntas</span>
                </p>
                ${progressHTML}
                ${buttonsHTML}
            </div>
        `;
    }

    testsContainer.innerHTML = htmlContent;

    // Vinculación de eventos (sin onclick)
    testsContainer.querySelectorAll('.btn-start-test').forEach(btn => {
        btn.addEventListener('click', () => startTest(parseInt(btn.dataset.id), btn.dataset.file));
    });

    testsContainer.querySelectorAll('.btn-reset-test').forEach(btn => {
        btn.addEventListener('click', () => resetTest(parseInt(btn.dataset.id), btn.dataset.file));
    });
}

/**
 * Función para iniciar el test
 */
async function startTest(testId, fileName) {
    try {
        const progress = await findTestProgress(testId);
        if (dataService.provider === 'sqlite' && dataService.getSyncState().pendingDeletes.includes(testId)) {
            await showModal('El borrado de este test todavía está pendiente de sincronizar. Conecta el dispositivo y confirma el borrado antes de empezar un intento nuevo.', 'Borrado pendiente');
            return;
        }
        if (!progress && dataService.provider === 'sqlite' && !dataService.getSyncState().progressKnown) {
            await showModal('Todavía no se ha podido comprobar si este test tiene respuestas guardadas. Conecta el dispositivo antes de comenzar un intento nuevo.', 'Progreso sin comprobar');
            return;
        }

        testsListSection.style.display = 'none';
        document.getElementById('test-view').style.display = 'block';
        document.getElementById('result-view').style.display = 'none';
        const appFooter = document.getElementById('app-footer');
        if (appFooter) appFooter.style.display = 'none';
        window.scrollTo(0, 0);

        if (progress) {
            await loadTestWithProgress(testId, fileName, progress);
        } else {
            await loadTest(testId, fileName);
        }
    } catch (error) {
        console.warn('⚠️ Error al iniciar test:', error);
        await showModal('No se pudo recuperar el progreso. Comprueba el acceso y la conexión antes de comenzar.', 'No se pudo abrir el test');
    }
}

/**
 * Resetea el progreso de un test
 */
async function resetTest(testId, fileName) {
    try {
        const isConfirmed = await showConfirm(
            '¿Estás seguro de que quieres eliminar el progreso de este test?\n\nEsta acción no se puede deshacer.',
            'Confirmar Reseteo'
        );

        if (isConfirmed) {
            const progress = await findTestProgress(testId);
            if (progress) {
                const deletion = await deleteProgress(progress.id, progress.revision);
                if (dataService.provider === 'sqlite' && deletion?.syncStatus !== 'synced') {
                    await showModal('El borrado aún no está confirmado en la base compartida. Tus respuestas se conservan; revisa la conexión o los cambios de otro dispositivo.', 'Borrado pendiente');
                    return;
                }

                testsListSection.style.display = 'none';
                document.getElementById('test-view').style.display = 'block';
                document.getElementById('result-view').style.display = 'none';
                window.scrollTo(0, 0);

                await loadTest(testId, fileName);
            }
        }
    } catch (error) {
        console.error('Error al resetear test:', error);
        await showModal('Hubo un error al resetear el test.', 'Error');
    }
}

// Inicialización
function initApp() {
    updateAppVersionInfo();
    initSQLiteSync(dataService, {
        beforeResolve: pauseAutoSave,
        currentDraft: currentProgressDraft,
        onConnected: async () => {
            if (testsListSection.style.display !== 'none') await loadTestsList();
        }
    });
    loadTestsList();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// Exportaciones para compatibilidad momentánea si fuera necesario
// window.loadTestsList = loadTestsList;
