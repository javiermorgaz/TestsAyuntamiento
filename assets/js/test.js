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

/**
 * Función para volver al listado de tests
 * Ahora limpia los intervalos y variables de auto-guardado
 */
function volverAlListado() {
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

    const testsListSection = document.getElementById('tests-list');
    const testView = document.getElementById('test-view');
    const resultadoView = document.getElementById('resultado-view');

    // Mostrar listado y ocultar otras vistas
    if (testsListSection) testsListSection.style.display = 'block';
    if (testView) testView.style.display = 'none';
    if (resultadoView) resultadoView.style.display = 'none';

    // Scroll al inicio
    window.scrollTo(0, 0);

    // Recargar el listado para mostrar nuevos resultados
    if (typeof cargarListadoTests === 'function') {
        cargarListadoTests();
    }
}

// Hacer la función disponible globalmente
window.volverAlListado = volverAlListado;

// Referencias a elementos del DOM
const testView = document.getElementById('test-view');
const resultadoView = document.getElementById('resultado-view');
const testTitulo = document.getElementById('test-titulo');
const questionsContainer = document.getElementById('questions-container');
const resultadoContainer = document.getElementById('resultado-container');
const btnFinish = document.getElementById('btn-finish');
const btnVolverInicio = document.getElementById('btn-volver-inicio');
const btnVolverInicioResultado = document.getElementById('btn-volver-inicio-resultado');

/**
 * Carga un test desde su archivo JSON
 * Ahora también inicializa el sistema de auto-guardado
 * @param {number} testId - ID del test
 * @param {string} fileName - Nombre del archivo JSON
 */
async function cargarTest(testId, fileName) {
    try {
        const response = await fetch(`./data/${fileName}`);

        if (!response.ok) {
            throw new Error(`Error al cargar el test: ${response.status}`);
        }

        currentTest = await response.json();

        // Inicializar el array de respuestas del usuario (null = sin responder)
        userResponses = new Array(currentTest.preguntas.length).fill(null);

        // Actualizar título
        testTitulo.textContent = currentTest.titulo;

        // Renderizar todas las preguntas
        renderizarTodasLasPreguntas();

        // NUEVO: Iniciar auto-guardado periódico cada 30 segundos
        if (autoSaveInterval) clearInterval(autoSaveInterval);

        autoSaveInterval = setInterval(async () => {
            await autoGuardarProgreso();
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
async function cargarTestConProgreso(testId, fileName, progreso) {
    try {
        // Primero cargar el test normalmente
        await cargarTest(testId, fileName);

        // Restaurar el ID de progreso
        currentProgressId = progreso.id;

        // Restaurar las respuestas guardadas
        userResponses = progreso.answers_data;

        // Marcar las respuestas en el formulario
        progreso.answers_data.forEach((respuesta, index) => {
            if (respuesta !== null) {
                const radio = document.querySelector(
                    `input[name="pregunta-${index}"][value="${respuesta}"]`
                );
                if (radio) {
                    radio.checked = true;
                }
            }
        });

        const respondidas = userResponses.filter(r => r !== null).length;
        console.log(`✅ Test restaurado con ${respondidas}/${currentTest.preguntas.length} respuestas`);

    } catch (error) {
        console.error("Error al cargar test con progreso:", error);
    }
}

/**
 * Renderiza todas las preguntas del test a la vez
 */
function renderizarTodasLasPreguntas() {
    if (!currentTest) return;

    let html = '<div class="space-y-6">';

    currentTest.preguntas.forEach((pregunta, index) => {
        html += `
            <div class="bg-white rounded-xl shadow-md p-3 md:p-4 border-l-4 border-primary hover:shadow-lg transition-shadow duration-300" id="pregunta-${index}">
                <div class="flex items-center gap-2 mb-3">
                    <span class="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-semibold">${index + 1}</span>
                </div>
                <p class="text-base md:text-lg text-dark font-medium mb-5 leading-relaxed">${pregunta.enunciado}</p>
                <div class="space-y-3">
        `;

        pregunta.opciones.forEach((opcion, opcionIndex) => {
            const valorOpcion = opcionIndex + 1;
            html += `
                <label class="flex items-start p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-primary/10 hover:border-primary border-2 border-transparent transition-all duration-200 group">
                    <input
                        type="radio"
                        name="pregunta-${index}"
                        value="${valorOpcion}"
                        onchange="guardarRespuesta(${index}, ${valorOpcion})"
                        class="mt-1 w-5 h-5 text-primary focus:ring-primary focus:ring-2 cursor-pointer"
                    >
                    <span class="ml-3 text-gray-700 group-hover:text-dark font-medium flex-1">${opcion}</span>
                </label>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    questionsContainer.innerHTML = html;
}

/**
 * Auto-guarda el progreso actual del test en Supabase
 * Se ejecuta periódicamente y cuando el usuario cambia una respuesta
 */
async function autoGuardarProgreso() {
    if (!currentTest) return;

    // Solo guardar si hay al menos una respuesta
    const respondidas = userResponses.filter(r => r !== null).length;
    if (respondidas === 0) return;

    try {
        const resultado = await guardarProgreso({
            id: currentProgressId,           // null la primera vez
            test_id: currentTest.id,
            answers_data: userResponses,
            total_questions: currentTest.preguntas.length
        });

        // Guardar el ID para futuras actualizaciones
        if (!currentProgressId && resultado.id) {
            currentProgressId = resultado.id;
        }

        console.log(`💾 Progreso guardado: ${respondidas}/${currentTest.preguntas.length} preguntas`);

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
async function guardarRespuesta(preguntaIndex, opcionSeleccionada) {
    userResponses[preguntaIndex] = opcionSeleccionada;

    // Trigger auto-guardado inmediato (debounced)
    // Espera 2 segundos después del último cambio antes de guardar
    if (window.autoSaveTimeout) clearTimeout(window.autoSaveTimeout);

    window.autoSaveTimeout = setTimeout(async () => {
        await autoGuardarProgreso();
    }, 2000); // 2 segundos
}

/**
 * Corrige el test y calcula la puntuación
 * Ahora guarda en Supabase además de localStorage
 */
async function corregirTest() {
    // Limpiar auto-guardado
    if (autoSaveInterval) {
        clearInterval(autoSaveInterval);
        autoSaveInterval = null;
    }

    let aciertos = 0;
    let errores = 0;
    let blancos = 0;

    const detalleRespuestas = [];

    currentTest.preguntas.forEach((pregunta, index) => {
        const respuestaUsuario = userResponses[index];
        const esCorrecta = respuestaUsuario === pregunta.respuesta_correcta;
        const enBlanco = respuestaUsuario === null;

        if (enBlanco) {
            blancos++;
        } else if (esCorrecta) {
            aciertos++;
        } else {
            errores++;
        }

        detalleRespuestas.push({
            pregunta: pregunta.enunciado,
            opciones: pregunta.opciones,
            respuestaUsuario: respuestaUsuario,
            respuestaCorrecta: pregunta.respuesta_correcta,
            esCorrecta: esCorrecta,
            enBlanco: enBlanco
        });
    });

    const totalPreguntas = currentTest.preguntas.length;
    const porcentaje = (aciertos / totalPreguntas) * 100;

    // Preparar answers_data con información de corrección para Supabase
    const answersData = userResponses.map((respuesta, index) => ({
        q_id: currentTest.preguntas[index].id_p,
        selected_option: respuesta,
        is_correct: respuesta === currentTest.preguntas[index].respuesta_correcta,
        correct_option: currentTest.preguntas[index].respuesta_correcta
    }));

    try {
        // Guardar en Supabase
        await completarTest({
            id: currentProgressId,              // Actualizar progreso existente
            test_id: currentTest.id,
            total_correct: aciertos,
            total_questions: totalPreguntas,
            score_percentage: porcentaje,
            answers_data: answersData
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
        aciertos: aciertos,
        errores: errores,
        blancos: blancos,
        total: totalPreguntas,
        respuestas: [...userResponses],
        detalle: detalleRespuestas
    };

    // También guardar en localStorage como backup
    guardarResultado(resultado);

    // Resetear ID de progreso
    currentProgressId = null;

    // Mostrar resultado
    mostrarResultado(resultado);
}

/**
 * Muestra el resultado del test con detalle de cada pregunta
 * @param {Object} resultado - Objeto con la información del resultado
 */
function mostrarResultado(resultado) {
    const porcentaje = ((resultado.aciertos / resultado.total) * 100).toFixed(1);

    let html = `
        <div class="glass-card p-8">
            <div class="text-center mb-8">
                <h2 class="text-3xl font-bold text-dark mb-2">🎯 Resultado del Test</h2>
                <h3 class="text-xl text-dark/80">${resultado.titulo}</h3>
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
                    <div class="text-2xl md:text-3xl font-bold">${porcentaje}%</div>
                </div>
            </div>

            <h3 class="text-2xl font-bold text-dark mb-6 flex items-center gap-2">
                <span>📝</span> Detalle de respuestas
            </h3>
            <div class="space-y-4">
    `;

    resultado.detalle.forEach((detalle, index) => {
        const esCorrecta = detalle.esCorrecta;
        const enBlanco = detalle.enBlanco;
        const iconoEstado = enBlanco ? '⚪' : (esCorrecta ? '✅' : '❌');
        const borderColor = enBlanco ? 'border-yellow-400' : (esCorrecta ? 'border-green-500' : 'border-red-500');
        const bgColor = enBlanco ? 'bg-yellow-50' : (esCorrecta ? 'bg-green-50' : 'bg-red-50');

        html += `
            <div class="bg-white rounded-xl shadow-md p-6 border-l-4 ${borderColor}">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-2xl">${iconoEstado}</span>
                    <span class="font-semibold text-dark">Pregunta ${index + 1}</span>
                </div>
                <p class="text-gray-700 font-medium mb-4">${detalle.pregunta}</p>
                <div class="space-y-2">
        `;

        // Mostrar opciones con indicadores
        detalle.opciones.forEach((opcion, opcionIndex) => {
            const valorOpcion = opcionIndex + 1;
            const esRespuestaUsuario = valorOpcion === detalle.respuestaUsuario;
            const esRespuestaCorrecta = valorOpcion === detalle.respuestaCorrecta;

            let claseOpcion = 'p-3 rounded-lg border-2 ';
            let marcador = '';
            let iconoOpcion = '';

            if (esRespuestaCorrecta) {
                claseOpcion += 'bg-green-100 border-green-500 text-green-900';
                marcador = '✓';
                iconoOpcion = '✅';
            } else if (esRespuestaUsuario && !esRespuestaCorrecta) {
                claseOpcion += 'bg-red-100 border-red-500 text-red-900';
                marcador = '✗';
                iconoOpcion = '❌';
            } else {
                claseOpcion += 'bg-gray-50 border-gray-200 text-gray-700';
            }

            html += `
                <div class="${claseOpcion} flex items-center gap-2">
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

    // Cambiar a vista de resultado
    testView.style.display = 'none';
    resultadoView.style.display = 'block';

    // Scroll al inicio
    window.scrollTo(0, 0);
}

// Event Listeners - Verificar que los elementos existan antes de añadir listeners
if (btnFinish) {
    btnFinish.addEventListener('click', async () => {
        await corregirTest();
    });
}

if (btnVolverInicio) {
    btnVolverInicio.addEventListener('click', volverAlListado);
}

if (btnVolverInicioResultado) {
    btnVolverInicioResultado.addEventListener('click', volverAlListado);
}
