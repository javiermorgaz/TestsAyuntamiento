// assets/js/main.js
import '/src/style.css';
import pkg from '../../package.json';

const TESTS_INDEX_URL = './data/tests_index.json';
const testsListSection = document.getElementById('tests-list');
const testsContainer = document.getElementById('tests-container');

/**
 * Actualiza la información de la versión y fecha de forma dinámica
 */
async function updateAppVersionInfo() {
    const versionEl = document.getElementById('app-version');
    const dateEl = document.getElementById('app-date');

    // Actualizar fecha
    if (dateEl) {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        dateEl.textContent = `${day}/${month}/${year}`;
    }

    // Cargar versión desde el import de Vite
    try {
        if (versionEl && pkg) {
            versionEl.textContent = `Versión ${pkg.version}`;
        }
    } catch (error) {
        console.warn('⚠️ No se pudo cargar la versión:', error);
        if (versionEl) versionEl.textContent = 'Versión (N/D)'; // Fallback genérico
    }
}

/**
 * Carga el archivo de índice de tests y llama a la función de renderizado.
 * Usa dataService para intentar Supabase primero, luego fallback a JSON local.
 */
async function loadTestsList() {
    try {
        // Mostrar skeleton loader moderno con texto
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

        // Usar dataService (intenta Supabase → fallback JSON)
        const tests = await window.fetchTests(); // fetchTests in dataService (attached to window)

        await renderTestsList(tests);

    } catch (error) {
        console.error("Error crítico al cargar listado:", error);
        testsContainer.innerHTML =
            '<p class="text-white text-center bg-red-500/20 p-4 rounded-lg border border-red-500/50">⚠️ No se pudieron cargar los tests. Revisa la consola y las rutas de los archivos JSON.</p>';
    }
}

/**
 * Genera el HTML para mostrar la lista de tests disponibles.
 * Ahora usa Tailwind CSS para un diseño moderno con glassmorphism.
 * @param {Array<Object>} tests - Array de objetos de tests.
 */
async function renderTestsList(tests) {
    if (tests.length === 0) {
        testsContainer.innerHTML = '<p class="text-white text-center">No hay tests disponibles.</p>';
        return;
    }

    let htmlContent = '';

    // Procesar cada test de forma asíncrona
    for (const test of tests) {
        // Buscar si hay progreso en curso
        const progress = await window.findTestProgress(test.id);

        let progressHTML = '';
        let buttonHTML = '';
        let resetButtonHTML = '';

        // Mostrar indicador de progreso si existe
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
                        <div class="bg-gradient-to-r from-accent to-primary h-2.5 rounded-full transition-all duration-300" style="width: ${percentage}%"></div>
                    </div>
                </div>
            `;

            // Botón para continuar (verde)
            buttonHTML = `
                <button class="flex-1 bg-gradient-to-r from-accent to-green-600 hover:from-green-600 hover:to-accent text-white font-normal text-sm py-2.5 px-5 rounded-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300" onclick="startTest(${test.id}, '${test.fichero}')">
                    ▶️ Continuar Test
                </button>
            `;

            // Botón para resetear (naranja)
            resetButtonHTML = `
                <button class="flex-1 bg-gradient-to-r from-reset to-orange-600 hover:from-orange-600 hover:to-reset text-white font-normal text-sm py-2.5 px-5 rounded-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300" onclick="resetTest(${test.id}, '${test.fichero}')">
                    🔄 Empezar de Nuevo
                </button>
            `;
        } else {
            // Botón normal para comenzar (azul)
            buttonHTML = `
                <button class="w-full bg-gradient-to-r from-primary to-secondary hover:from-secondary hover:to-primary text-white font-normal text-sm py-2.5 px-5 rounded-lg shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300" onclick="startTest(${test.id}, '${test.fichero}')">
                    🚀 Comenzar Test
                </button>
            `;
        }

        htmlContent += `
            <div class="glass-card p-6 hover:shadow-2xl transform hover:-translate-y-2 transition-all duration-300 select-none">
                <h3 class="text-base font-bold text-dark mb-2">${test.titulo}</h3>
                <p class="text-sm text-gray-500 mb-4 flex items-center gap-2 dark:text-gray-400">
                    <span class="text-xl">📋</span>
                    <span>${test.num_preguntas} preguntas</span>
                </p>
                ${progressHTML}
                <div class="flex gap-3 ${progress ? 'flex-col sm:flex-row' : ''}">
                    ${buttonHTML}
                    ${resetButtonHTML}
                </div>
            </div>
        `;
    }

    testsContainer.innerHTML = htmlContent;
}


// Función para iniciar el test
// Ahora detecta si hay progreso anterior y lo carga directamente
async function startTest(testId, fileName) {
    try {
        // Buscar progreso existente en Supabase
        const progress = await window.findTestProgress(testId);

        if (progress) {
            // Continuar test con progreso guardado directamente
            testsListSection.style.display = 'none';
            document.getElementById('test-view').style.display = 'block';
            document.getElementById('result-view').style.display = 'none';
            document.getElementById('app-footer').style.display = 'none';
            window.scrollTo(0, 0);

            await window.loadTestWithProgress(testId, fileName, progress);
            return;
        }
    } catch (error) {
        console.warn('⚠️ Error al verificar progreso:', error);
    }

    // Continuar con flujo normal (test nuevo)
    testsListSection.style.display = 'none';
    document.getElementById('test-view').style.display = 'block';
    document.getElementById('result-view').style.display = 'none';
    document.getElementById('app-footer').style.display = 'none';
    window.scrollTo(0, 0);

    // Llamar a la función que cargará el test real (definida en test.js)
    window.loadTest(testId, fileName);
}

/**
 * Resetea el progreso de un test específico
 * Muestra confirmación antes de eliminar y navega al test
 * @param {number} testId - ID del test a resetear
 * @param {string} fileName - Nombre del archivo del test
 */
async function resetTest(testId, fileName) {
    try {
        const isConfirmed = await window.showConfirm(
            '¿Estás seguro de que quieres eliminar el progreso de este test?\n\nEsta acción no se puede deshacer.',
            'Confirmar Reseteo'
        );

        if (isConfirmed) {
            // Buscar el progreso actual
            const progress = await window.findTestProgress(testId);

            if (progress) {
                // Eliminar el progreso
                await window.deleteProgress(progress.id);
                console.log('🗑️ Progreso eliminado, iniciando test nuevo');

                // Navegar directamente al test
                testsListSection.style.display = 'none';
                document.getElementById('test-view').style.display = 'block';
                document.getElementById('result-view').style.display = 'none';
                window.scrollTo(0, 0);

                // Cargar el test
                window.loadTest(testId, fileName);
            }
        }
    } catch (error) {
        console.error('Error al resetear test:', error);
        await window.showModal('Hubo un error al resetear el test. Por favor, inténtalo de nuevo.', 'Error');
    }
}

// Ejecutar la carga al iniciar la aplicación
updateAppVersionInfo();
loadTestsList();

// Expose functions to window for legacy onclick handlers
window.startTest = startTest;
window.resetTest = resetTest;
window.loadTestsList = loadTestsList;
