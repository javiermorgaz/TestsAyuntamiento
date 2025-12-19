// assets/js/test.js

/**
 * Lógica para cargar y ejecutar un test individual
 * Muestra todas las preguntas a la vez y permite corregir al final
 */

// Variables globales del test actual
let currentTest = null;
let userResponses = []; // Array para almacenar las respuestas del usuario
let currentProgressId = null; // ID del progreso en Supabase
let autoSaveInterval = null; // Intervalo de auto-guardado periódico
let currentViewMode = 'list'; // 'list' or 'slider'

/**
 * Función para volver al listado de tests
 * Ahora limpia los intervalos y variables de auto-guardado
 */
function returnToList() {
    // Limpiar auto-guardado periódico
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    // Limpiar timeout de guardado debounced
    if (window.autoSaveTimeout) {
        clearTimeout(window.autoSaveTimeout);
        window.autoSaveTimeout = null;
    }

    // Resetear variables globales
    currentTest = null;
    userResponses = [];
    currentProgressId = null;
    currentViewMode = 'list';
    updateViewModeUI();

    const testsListSection = document.getElementById('tests-list');
    const testView = document.getElementById('test-view');
    const resultadoView = document.getElementById('result-view');

    // Mostrar listado y ocultar otras vistas
    if (testsListSection) testsListSection.style.display = 'block';
    if (testView) testView.style.display = 'none';
    if (resultadoView) resultadoView.style.display = 'none';

    // Scroll al inicio
    window.scrollTo(0, 0);

    // Recargar el listado para mostrar nuevos resultados
    if (typeof loadTestsList === 'function') {
        loadTestsList();
    }
}

// Hacer la función disponible globalmente
window.returnToList = returnToList;

// Referencias a elementos del DOM
const testView = document.getElementById('test-view');
const resultadoView = document.getElementById('result-view');
const testTitleEl = document.getElementById('test-title');
const questionsContainer = document.getElementById('questions-container');
const resultadoContainer = document.getElementById('result-container');
const btnFinish = document.getElementById('btn-finish');
const btnBackHome = document.getElementById('btn-back-home');
const btnBackHomeResult = document.getElementById('btn-back-home-result');

/**
 * Carga un test desde su archivo JSON
 * Ahora también inicializa el sistema de auto-guardado
 * @param {number} testId - ID del test
 * @param {string} fileName - Nombre del archivo JSON
 */
async function loadTest(testId, fileName) {
    currentViewMode = 'list';
    try {
        const response = await fetch(`./data/${fileName}`);

        if (!response.ok) {
            throw new Error(`Error al cargar el test: ${response.status}`);
        }

        currentTest = await response.json();

        // Inicializar el array de respuestas del usuario (null = sin responder)
        userResponses = new Array(currentTest.preguntas.length).fill(null);

        // Actualizar título
        testTitleEl.textContent = currentTest.titulo;

        // Renderizar todas las preguntas
        renderAllQuestions();
        updateViewModeUI();

        // NUEVO: Iniciar auto-guardado periódico cada 30 segundos
        if (autoSaveInterval) clearInterval(autoSaveInterval);

        autoSaveInterval = setInterval(async () => {
            await autoSaveProgress();
        }, 30000); // 30 segundos

        console.log('🔄 Sistema de auto-guardado activado (cada 30s)');

    } catch (error) {
        console.error("Error al cargar el test:", error);
        questionsContainer.innerHTML = '<p style="color:red;">Error al cargar el test. Verifica la consola.</p>';
    }
}

/**
 * Carga un test con progreso anterior (continuación)
 * @param {number} testId - ID del test
 * @param {string} fileName - Nombre del archivo JSON
 * @param {Object} progreso - Objeto con el progreso guardado
 */
async function loadTestWithProgress(testId, fileName, progress) {
    try {
        // Primero cargar el test normalmente
        await loadTest(testId, fileName);

        // Restaurar el ID de progreso
        currentProgressId = progress.id;

        // Restaurar las respuestas guardadas
        userResponses = progress.answers_data;

        // Marcar las respuestas en el formulario
        progress.answers_data.forEach((answer, index) => {
            if (answer !== null) {
                const radio = document.querySelector(
                    `input[name="pregunta-${index}"][value="${answer}"]`
                );
                if (radio) {
                    radio.checked = true;
                }
            }
        });

        const answeredCount = userResponses.filter(r => r !== null).length;
        console.log(`✅ Test restaurado con ${answeredCount}/${currentTest.preguntas.length} respuestas`);

    } catch (error) {
        console.error("Error al cargar test con progreso:", error);
    }
}

/**
 * Renderiza todas las preguntas del test a la vez
 */
function renderAllQuestions() {
    if (!currentTest) return;

    let html = '';

    currentTest.preguntas.forEach((pregunta, index) => {
        // Determine styles based on autogenerated status
        const isAuto = pregunta.autogenerado === true;

        // Border color: Primary (default) vs Purple (Auto)
        const borderClass = isAuto
            ? 'border-purple-500 dark:border-purple-500/80'
            : 'border-primary dark:border-primary/80';

        // Number circle color: Primary vs Purple (Auto)
        const numberBgClass = isAuto
            ? 'bg-purple-600 dark:bg-purple-900/50'
            : 'bg-primary';

        // Badge HTML - Improved contrast for light mode (bg-purple-600 text-white)
        // Using ml-2 to stick it next to the number.
        const autoBadge = isAuto
            ? `<span class="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-600 text-white dark:bg-purple-900/50 dark:text-purple-300 dark:border dark:border-purple-700/50 shadow-sm">
                ✨ IA
               </span>`
            : '';

        html += `
            <div class="bg-white rounded-xl shadow-md p-3 md:p-4 border-l-4 ${borderClass} hover:shadow-lg transition-shadow duration-300 dark:bg-gray-800" id="pregunta-${index}">
                <div class="flex items-center gap-2 mb-3">
                    <span class="${numberBgClass} text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">${index + 1}</span>
                    ${autoBadge}
                </div>
                <p class="text-base md:text-lg text-dark font-medium mb-5 leading-relaxed dark:text-gray-200">${pregunta.enunciado}</p>
                <div class="space-y-3">
        `;

        pregunta.opciones.forEach((opcion, opcionIndex) => {
            const optionValue = opcionIndex + 1;
            html += `
                <label class="flex items-start p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-primary/10 hover:border-primary border-2 border-transparent transition-all duration-200 group dark:bg-gray-700/50 dark:hover:bg-primary/20 dark:hover:border-primary/50">
                    <input
                        type="radio"
                        name="pregunta-${index}"
                        value="${optionValue}"
                        onchange="saveAnswer(${index}, ${optionValue})"
                        class="mt-1 w-5 h-5 text-primary focus:ring-primary focus:ring-2 cursor-pointer dark:bg-gray-600 dark:border-gray-500"
                    >
                    <span class="ml-3 text-gray-700 group-hover:text-dark font-medium flex-1 dark:text-gray-300 dark:group-hover:text-gray-100">${opcion}</span>
                </label>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    // html += '</div>';
    questionsContainer.innerHTML = html;
}

/**
 * Auto-guarda el progreso actual del test en Supabase
 * Se ejecuta periódicamente y cuando el usuario cambia una respuesta
 */
async function autoSaveProgress() {
    if (!currentTest) return;

    // Solo guardar si hay al menos una respuesta
    const answeredCount = userResponses.filter(r => r !== null).length;
    if (answeredCount === 0) return;

    try {
        const resultado = await saveProgress({
            id: currentProgressId,           // null la primera vez
            test_id: currentTest.id,
            answers_data: userResponses,
            total_questions: currentTest.preguntas.length
        });

        // Guardar el ID para futuras actualizaciones
        if (!currentProgressId && resultado.id) {
            currentProgressId = resultado.id;
        }

        console.log(`💾 Progreso guardado: ${answeredCount}/${currentTest.preguntas.length} preguntas`);

        // Mostrar indicador visual de guardado
        showSaveIndicator();
    } catch (error) {
        console.error('⚠️ Error al auto-guardar:', error);
    }
}

/**
 * Muestra un indicador visual no intrusivo de que se ha guardado el progreso
 */
function showSaveIndicator() {
    // Buscar el contenedor en el header o crear indicador en body
    const container = document.getElementById('save-indicator-container');
    let indicator = document.getElementById('save-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.className = 'save-indicator';
        indicator.innerHTML = '✓ Guardado';

        // Si existe el contenedor del header, añadirlo ahí, sino al body
        if (container) {
            container.appendChild(indicator);
        } else {
            document.body.appendChild(indicator);
        }
    }

    // Mostrar el indicador
    indicator.classList.add('show');

    // Ocultar después de 2 segundos
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2000);
}

/**
 * Guarda la respuesta seleccionada por el usuario
 * Ahora también dispara un auto-guardado debounced
 * @param {number} preguntaIndex - Índice de la pregunta
 * @param {number} opcionSeleccionada - Índice de la opción (1-based)
 */
async function saveAnswer(preguntaIndex, opcionSeleccionada) {
    userResponses[preguntaIndex] = opcionSeleccionada;

    // Trigger auto-guardado inmediato (debounced)
    // Espera 2 segundos después del último cambio antes de guardar
    if (window.autoSaveTimeout) clearTimeout(window.autoSaveTimeout);

    window.autoSaveTimeout = setTimeout(async () => {
        await autoSaveProgress();
    }, 2000); // 2 segundos
}

/**
 * Corrige el test y calcula la puntuación
 * Ahora guarda en Supabase además de localStorage
 */
async function gradeTest() {
    // Limpiar auto-guardado
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    let correctCount = 0;
    let errorCount = 0;
    let unansweredCount = 0;

    const answerDetails = [];

    currentTest.preguntas.forEach((pregunta, index) => {
        const userAnswer = userResponses[index];
        const isCorrect = userAnswer === pregunta.respuesta_correcta;
        const isUnanswered = userAnswer === null;

        if (isUnanswered) {
            unansweredCount++;
        } else if (isCorrect) {
            correctCount++;
        } else {
            errorCount++;
        }

        answerDetails.push({
            pregunta: pregunta.enunciado,
            opciones: pregunta.opciones,
            respuestaUsuario: userAnswer,
            respuestaCorrecta: pregunta.respuesta_correcta,
            esCorrecta: isCorrect,
            enBlanco: isUnanswered
        });
    });

    const totalPreguntas = currentTest.preguntas.length;
    const percentage = (correctCount / totalPreguntas) * 100;

    // Data simplification: User only wants the array of values, not complex objects
    // const answersData = userResponses.map(...) - REMOVED

    try {
        // Guardar en Supabase
        await completeTest({
            id: currentProgressId,              // Actualizar progreso existente
            test_id: currentTest.id,
            total_correct: correctCount,
            total_questions: totalPreguntas,
            score_percentage: percentage,
            answers_data: userResponses // Send simple array directly
        });

        console.log('✅ Resultado guardado en Supabase');
    } catch (error) {
        console.error('⚠️ Error al guardar en Supabase:', error);
        console.log('💾 Guardado solo en localStorage');
    }

    // Preparar objeto resultado para localStorage y visualización
    const resultado = {
        testId: currentTest.id,
        titulo: currentTest.titulo,
        fecha: new Date().toISOString(),
        aciertos: correctCount,
        errores: errorCount,
        blancos: unansweredCount,
        total: totalPreguntas,
        respuestas: [...userResponses],
        detalle: answerDetails
    };

    // También guardar en localStorage como backup
    saveResult(resultado);

    // Resetear ID de progreso
    currentProgressId = null;

    // Mostrar resultado
    displayResult(resultado);
}

/**
 * Muestra el resultado del test con detalle de cada pregunta
 * @param {Object} resultado - Objeto con la información del resultado
 */
function displayResult(resultado) {
    const percentage = ((resultado.aciertos / resultado.total) * 100).toFixed(1);

    let html = `
        <div class="glass-card p-8">
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-dark mb-2 dark:text-gray-100">🎯 Resultado del Test</h2>
                <h3 class="text-xl text-dark/80 dark:text-gray-300">${resultado.titulo}</h3>
            </div>
            
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <div class="bg-gradient-to-br from-green-400 to-green-600 rounded-xl p-4 text-white shadow-lg">
                    <div class="text-xs font-medium mb-1 opacity-90">Aciertos</div>
                    <div class="text-2xl md:text-3xl font-bold">${resultado.aciertos}</div>
                </div>
                <div class="bg-gradient-to-br from-red-400 to-red-600 rounded-xl p-4 text-white shadow-lg">
                    <div class="text-xs font-medium mb-1 opacity-90">Errores</div>
                    <div class="text-2xl md:text-3xl font-bold">${resultado.errores}</div>
                </div>
                <div class="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-xl p-4 text-white shadow-lg">
                    <div class="text-xs font-medium mb-1 opacity-90">En blanco</div>
                    <div class="text-2xl md:text-3xl font-bold">${resultado.blancos}</div>
                </div>
                <div class="bg-gradient-to-br from-primary to-secondary rounded-xl p-4 text-white shadow-lg">
                    <div class="text-xs font-medium mb-1 opacity-90">Puntuación</div>
                    <div class="text-2xl md:text-3xl font-bold">${percentage}%</div>
                </div>
            </div>

            <h3 class="text-2xl font-bold text-dark mb-6 flex items-center gap-2 dark:text-gray-100">
                <span>📝</span> Detalle de respuestas
            </h3>
            <div class="space-y-4">
    `;

    resultado.detalle.forEach((detalle, index) => {
        const isCorrect = detalle.esCorrecta;
        const isUnanswered = detalle.enBlanco;
        const statusIcon = isUnanswered ? '⚪' : (isCorrect ? '✅' : '❌');
        const borderColor = isUnanswered ? 'border-yellow-400' : (isCorrect ? 'border-green-500' : 'border-red-500');
        const bgColor = isUnanswered ? 'bg-yellow-50' : (isCorrect ? 'bg-green-50' : 'bg-red-50');

        html += `
            <div class="bg-white rounded-xl shadow-md p-6 border-l-4 ${borderColor} dark:bg-gray-800">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-2xl">${statusIcon}</span>
                    <span class="font-semibold text-dark dark:text-gray-100">Pregunta ${index + 1}</span>
                </div>
                <p class="text-gray-700 font-medium mb-4 dark:text-gray-300">${detalle.pregunta}</p>
                <div class="space-y-2">
        `;

        // Mostrar opciones con indicadores
        detalle.opciones.forEach((opcion, opcionIndex) => {
            const optionValue = opcionIndex + 1;
            const isUserAnswer = optionValue === detalle.respuestaUsuario;
            const isCorrectAnswer = optionValue === detalle.respuestaCorrecta;

            let optionClass = 'p-3 rounded-lg border-2 ';
            let marcador = '';
            let iconoOpcion = '';

            if (isCorrectAnswer) {
                optionClass += 'bg-green-100 border-green-500 text-green-900 dark:bg-green-900/40 dark:text-green-300';
                marcador = '✓';
                iconoOpcion = '✅';
            } else if (isUserAnswer && !isCorrectAnswer) {
                optionClass += 'bg-red-100 border-red-500 text-red-900 dark:bg-red-900/40 dark:text-red-300';
                marcador = '✗';
                iconoOpcion = '❌';
            } else {
                optionClass += 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-700/50 dark:border-gray-600 dark:text-gray-400';
            }

            html += `
                <div class="${optionClass} flex items-center gap-2">
                    ${iconoOpcion ? `<span class="text-lg">${iconoOpcion}</span>` : ''}
                    <span class="font-medium">${marcador ? marcador + ' ' : ''}${opcion}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>
    `;

    resultadoContainer.innerHTML = html;

    // Clean up Slider Mode if active
    if (currentViewMode === 'slider') {
        removeSliderNavigation();
        document.body.classList.remove('slider-view-active');
        if (questionsContainer) {
            questionsContainer.classList.remove('slider-mode');
            questionsContainer.classList.add('space-y-6');
        }
    }

    // Cambiar a vista de resultado
    testView.style.display = 'none';
    resultadoView.style.display = 'block';

    // Scroll al inicio
    window.scrollTo(0, 0);
}

// Event Listeners - Verificar que los elementos existan antes de añadir listeners
if (btnFinish) {
    btnFinish.addEventListener('click', async () => {
        await gradeTest();
    });
}

if (btnBackHome) {
    btnBackHome.addEventListener('click', returnToList);
}

if (btnBackHomeResult) {
    btnBackHomeResult.addEventListener('click', returnToList);
}

// ---------------------------------------------------------
// Slider Mode Implementation
// ---------------------------------------------------------

/**
 * Toggles between List and Slider view modes
 */
function toggleViewMode() {
    currentViewMode = currentViewMode === 'list' ? 'slider' : 'list';
    updateViewModeUI();
}

/**
 * Updates the UI based on the current view mode
 */
function updateViewModeUI() {
    const listIcon = document.getElementById('icon-view-list');
    const sliderIcon = document.getElementById('icon-view-slider');
    const testControls = document.getElementById('test-controls');
    const form = document.getElementById('questions-form');

    // 1. Calculate the current question index to maintain synchronization
    let syncIndex = 0;
    if (currentViewMode === 'slider') {
        // We are ENTERING Slider Mode, find where we were in the list
        syncIndex = getCurrentQuestionIndexInListMode();
    } else {
        // We are EXITING Slider Mode, find where we were in the slider
        if (questionsContainer) {
            const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
            const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;

            if (scrollUnit > 0) {
                syncIndex = Math.round(questionsContainer.scrollLeft / scrollUnit);
            }
        }
    }

    // Toggle Button Icons
    if (listIcon && sliderIcon) {
        if (currentViewMode === 'slider') {
            listIcon.classList.remove('hidden');
            sliderIcon.classList.add('hidden');
        } else {
            listIcon.classList.add('hidden');
            sliderIcon.classList.remove('hidden');
        }
    }

    // Container Styles
    if (currentViewMode === 'slider') {
        document.body.classList.add('slider-view-active');
        if (questionsContainer) {
            questionsContainer.classList.add('slider-mode');
            questionsContainer.classList.remove('space-y-6');

            // Ensure no conflicting inline styles
            questionsContainer.style.display = '';
            questionsContainer.style.flexFlow = '';
        }

        // Move Finalize button into slider as the last slide
        if (testControls && questionsContainer && testControls.parentNode !== questionsContainer) {
            questionsContainer.appendChild(testControls);
        }

        // Add Slider Navigation Controls
        addSliderNavigation();

        // Fix: Sync scroll position to the stored index
        requestAnimationFrame(() => {
            if (questionsContainer) {
                // Reset vertical scroll to ensure the question starts from the top
                window.scrollTo(0, 0);

                const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
                const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;

                // Decisive fix: Temporarily disable snap and behavior to ensure it's instant
                const originalSnap = questionsContainer.style.scrollSnapType;
                questionsContainer.style.scrollSnapType = 'none';
                questionsContainer.style.scrollBehavior = 'auto';

                questionsContainer.scrollTo({
                    left: syncIndex * scrollUnit,
                    behavior: 'auto'
                });

                // Restore snap for manual navigation
                requestAnimationFrame(() => {
                    if (questionsContainer) {
                        questionsContainer.style.scrollSnapType = originalSnap;
                        questionsContainer.style.scrollBehavior = '';
                    }
                });

                updateSliderButtonsVisibility();
                // Update container height for the initial slide
                updateSliderContainerHeight();
            }
        });

    } else {
        document.body.classList.remove('slider-view-active');
        if (questionsContainer) {
            questionsContainer.classList.remove('slider-mode');
            questionsContainer.classList.add('space-y-6');
        }

        // Move Finalize button back after questions-form
        if (testControls && testControls.parentNode === questionsContainer) {
            if (form) form.after(testControls);

            // Reset controls styles
            testControls.style.minWidth = '';
            testControls.style.flex = '';
        }

        // Remove Slider Navigation
        removeSliderNavigation();

        // Sync: Scroll window to the corresponding question in List Mode
        requestAnimationFrame(() => {
            const targetEl = document.getElementById(`pregunta-${syncIndex}`);
            if (targetEl) {
                const headerOffset = 100; // Account for sticky header
                const elementPosition = targetEl.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'auto'
                });
            }
        });

        // Reset container height when leaving slider mode
        if (questionsContainer) questionsContainer.style.height = '';
    }
}

/**
 * Detects the "dominant" question currently in the user's focus in List Mode.
 * This is used to synchronize the starting slide when entering Slider Mode.
 * @returns {number} index of the question
 */
function getCurrentQuestionIndexInListMode() {
    if (!questionsContainer) return 0;

    // Filter specifically for question cards to ignore title/controls
    const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
    if (items.length === 0) return 0;

    // Focus point (40% of viewport height)
    const focusPoint = window.innerHeight * 0.7;

    for (let i = 0; i < items.length; i++) {
        const rect = items[i].getBoundingClientRect();

        // Resilient Logic: The first question whose bottom is BELOW the focus point 
        // is the one the user is primarily focused on.
        // This naturally handles gaps: if the focus point is in a gap between Q1 and Q2,
        // Q1's bottom will be ABOVE the point, and Q2's bottom will be BELOW, correctly picking Q2.
        if (rect.bottom > focusPoint) {
            return i;
        }
    }

    // Default to the last question if everything is above the focus point
    return items.length - 1;
}

/**
 * Injects navigation controls for slider mode
 */
function addSliderNavigation() {
    let nav = document.getElementById('slider-nav-controls');
    if (!nav) {
        nav = document.createElement('div');
        nav.id = 'slider-nav-controls';
        nav.className = 'slider-controls-container';

        const btnPrev = document.createElement('button');
        btnPrev.id = 'slider-prev';
        btnPrev.className = 'bg-white/90 backdrop-blur hover:bg-white text-gray-800 font-bold py-3 px-6 rounded-full shadow-lg border border-gray-200 dark:bg-gray-800/90 dark:text-white dark:border-gray-700 transition-all transform hover:scale-105 flex items-center gap-2';
        btnPrev.innerHTML = '← <span class="hidden md:inline">Anterior</span><span class="md:hidden">Ant.</span>';
        btnPrev.onclick = (e) => {
            e.stopPropagation();
            scrollSlider(-1);
        };

        const btnNext = document.createElement('button');
        btnNext.id = 'slider-next';
        btnNext.className = 'bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2';
        btnNext.innerHTML = '<span class="hidden md:inline">Siguiente</span><span class="md:hidden">Sig.</span> →';
        btnNext.onclick = (e) => {
            e.stopPropagation();
            scrollSlider(1);
        };

        const btnFinishSlider = document.createElement('button');
        btnFinishSlider.id = 'slider-finish';
        btnFinishSlider.className = 'bg-primary hover:bg-secondary text-white font-bold py-3 px-8 rounded-full shadow-lg transition-all transform hover:scale-105 flex items-center gap-2';
        btnFinishSlider.innerHTML = '🏁 <span class="hidden md:inline">Finalizar y Corregir</span><span class="md:hidden">Finalizar</span>';
        btnFinishSlider.onclick = (e) => {
            e.stopPropagation();
            gradeTest();
        };

        nav.appendChild(btnPrev);
        nav.appendChild(btnNext);
        nav.appendChild(btnFinishSlider);

        document.body.appendChild(nav);
    }

    // Always ensure the listener is present when showing the navigation
    if (questionsContainer) {
        questionsContainer.removeEventListener('scroll', updateSliderButtonsVisibility);
        questionsContainer.addEventListener('scroll', updateSliderButtonsVisibility);
    }

    nav.style.display = 'flex';
    updateSliderButtonsVisibility();
}

/**
 * Updates visibility of prev/next buttons based on scroll position
 */
function updateSliderButtonsVisibility() {
    const btnPrev = document.getElementById('slider-prev');
    const btnNext = document.getElementById('slider-next');
    const btnFinish = document.getElementById('slider-finish');
    if (!btnPrev || !btnNext || !btnFinish || !questionsContainer || questionsContainer.offsetWidth === 0) return;

    const scrollLeft = questionsContainer.scrollLeft;
    const offsetWidth = questionsContainer.offsetWidth;
    const scrollWidth = questionsContainer.scrollWidth;

    // Calculate max scroll with some tolerance
    const maxScroll = scrollWidth - offsetWidth;

    // Show/Hide Previous (first slide)
    const isFirst = scrollLeft < 10;
    btnPrev.style.display = isFirst ? 'none' : 'flex';

    // Show/Hide Next & Finish (last slide)
    // Tolerance of 5px to account for rounding errors on high-DPI screens
    const isLast = scrollLeft >= (maxScroll - 5);
    btnNext.style.display = isLast ? 'none' : 'flex';
    btnFinish.style.display = isLast ? 'flex' : 'none';

    // Update the container height based on the active slide
    updateSliderContainerHeight();

    console.log(`[Slider] Pos: ${scrollLeft}, Max: ${maxScroll}, First: ${isFirst}, Last: ${isLast}`);
}

/**
 * Adjusts the height of the questionsContainer to match the current active slide's content.
 * This ensures the "glass box" is always perfectly sized.
 */
function updateSliderContainerHeight() {
    if (currentViewMode !== 'slider' || !questionsContainer) return;

    const scrollLeft = questionsContainer.scrollLeft;
    // Filter specifically for question cards to ignore title/controls
    const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));

    if (items.length === 0) return;

    // Calculate the distance between elements (includes horizontal gap)
    const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;
    if (scrollUnit === 0) return;

    // Use a small buffer to avoid flipping height while scrolling between slides
    const currentIndex = Math.round(scrollLeft / scrollUnit);
    const activeItem = items[currentIndex];

    if (activeItem) {
        // Use scrollHeight to get the natural height of the content inside the card
        const height = activeItem.offsetHeight;
        questionsContainer.style.height = `${height}px`;
    }
}

function removeSliderNavigation() {
    const nav = document.getElementById('slider-nav-controls');
    if (nav) {
        nav.style.display = 'none';
    }
    if (questionsContainer) {
        questionsContainer.removeEventListener('scroll', updateSliderButtonsVisibility);
    }
}

/**
 * Scrolls the slider container
 * @param {number} direction -1 for prev, 1 for next
 */
function scrollSlider(direction) {
    if (!questionsContainer) return;

    const items = Array.from(questionsContainer.children).filter(el => el.id && el.id.startsWith('pregunta-'));
    const scrollUnit = (items.length >= 2) ? (items[1].offsetLeft - items[0].offsetLeft) : questionsContainer.offsetWidth;

    console.log(`Action: ${direction > 0 ? 'Next' : 'Prev'} | Unit: ${scrollUnit}`);

    questionsContainer.scrollBy({
        left: direction * scrollUnit,
        behavior: 'smooth'
    });
}
window.scrollSlider = scrollSlider;

// Add listener for toggle button
document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('view-mode-toggle');
    if (btnToggle) {
        btnToggle.addEventListener('click', toggleViewMode);
    }
});

const btnToggleNow = document.getElementById('view-mode-toggle');
if (btnToggleNow) {
    btnToggleNow.addEventListener('click', toggleViewMode);
}
