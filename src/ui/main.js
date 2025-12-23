// assets/js/main.js
import '/src/styles/style.css';
import pkg from '../../package.json';
import { fetchTests, findTestProgress, deleteProgress } from '@services/dataService.js';
import { showConfirm, showModal } from '@ui/modal.js';
import { loadTest, loadTestWithProgress } from '@core/test.js';

const testsListSection = document.getElementById('tests-list');
const testsContainer = document.getElementById('tests-container');

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
            <div class="col-span-full">
                <p class="text-white drop-shadow-lg text-center text-2xl md:text-3xl font-light mb-8 animate-pulse" style="color: #ffffff;">Cargando tests...</p>
                <div class="space-y-6">
                    ${[1, 2, 3, 4].map(() => `
                        <div class="glass-card p-6 animate-pulse">
                            <div class="h-6 bg-white/30 rounded w-3/4 mb-4 dark:bg-gray-700/50"></div>
                            <div class="h-4 bg-white/20 rounded w-1/2 mb-6 dark:bg-gray-700/30"></div>
                            <div class="h-12 bg-white/25 rounded dark:bg-gray-700/40"></div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        const tests = await fetchTests();
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

    let htmlContent = '';
    const itemsData = [];

    for (const test of tests) {
        const progress = await findTestProgress(test.id);

        let progressHTML = '';
        let buttonsHTML = '';

        if (progress) {
            const answeredCount = progress.answers_data.filter(a => a !== null).length;
            const percentage = Math.round((answeredCount / progress.total_questions) * 100);

            progressHTML = `
                <div class="mb-4">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">📝 En progreso</span>
                        <span class="text-sm font-semibold text-primary">${answeredCount}/${progress.total_questions}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                        <div class="bg-gradient-to-r from-accent to-green-600 h-2.5 rounded-full" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;

            buttonsHTML = `
                <div class="flex gap-3 flex-col sm:flex-row">
                    <button class="btn-start-test flex-1 bg-gradient-to-r from-accent to-green-600 text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${test.id}" data-file="${test.fichero}">
                        ▶️ Continuar Test
                    </button>
                    <button class="btn-reset-test flex-1 bg-gradient-to-r from-reset to-orange-600 text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${test.id}" data-file="${test.fichero}">
                        🔄 Empezar de Nuevo
                    </button>
                </div>
            `;
        } else {
            buttonsHTML = `
                <button class="btn-start-test w-full bg-gradient-to-r from-primary to-secondary text-white py-2.5 px-5 rounded-lg shadow-md" data-id="${test.id}" data-file="${test.fichero}">
                    🚀 Comenzar Test
                </button>
            `;
        }

        htmlContent += `
            <div class="glass-card p-6 hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300">
                <h3 class="text-base font-bold text-dark mb-2">${test.titulo}</h3>
                <p class="text-sm text-gray-500 mb-4 flex items-center gap-2 dark:text-gray-400">
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
                await deleteProgress(progress.id);

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
document.addEventListener('DOMContentLoaded', () => {
    updateAppVersionInfo();
    loadTestsList();
});

// Exportaciones para compatibilidad momentánea si fuera necesario
// window.loadTestsList = loadTestsList;
