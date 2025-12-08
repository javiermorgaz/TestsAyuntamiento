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

    let html = '<div class="preguntas-listado">';

    currentTest.preguntas.forEach((pregunta, index) => {
        html += `
            <div class="pregunta-item" id="pregunta-${index}">
                <h3 class="pregunta-numero">Pregunta ${index + 1}</h3>
                <p class="enunciado">${pregunta.enunciado}</p>
                <div class="opciones">
        `;

        pregunta.opciones.forEach((opcion, opcionIndex) => {
            const valorOpcion = opcionIndex + 1;
            html += `
                <label class="opcion-label">
                    <input
                        type="radio"
                        name="pregunta-${index}"
                        value="${valorOpcion}"
                        onchange="guardarRespuesta(${index}, ${valorOpcion})"
                    >
                    <span class="opcion-texto">${opcion}</span>
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
    // Buscar o crear el indicador
    let indicator = document.getElementById('save-indicator');

    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'save-indicator';
        indicator.className = 'save-indicator';
        indicator.innerHTML = '✓ Guardado';
        document.body.appendChild(indicator);
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
        <div class="resultado-card">
            <h2>Resultado del Test</h2>
            <h3>${resultado.titulo}</h3>
            <div class="resultado-stats">
                <div class="stat aciertos">
                    <span class="stat-label">Aciertos</span>
                    <span class="stat-value">${resultado.aciertos}</span>
                </div>
                <div class="stat errores">
                    <span class="stat-label">Errores</span>
                    <span class="stat-value">${resultado.errores}</span>
                </div>
                <div class="stat blancos">
                    <span class="stat-label">En blanco</span>
                    <span class="stat-value">${resultado.blancos}</span>
                </div>
                <div class="stat total">
                    <span class="stat-label">Puntuación</span>
                    <span class="stat-value">${porcentaje}%</span>
                </div>
            </div>

            <h3 class="detalle-titulo">Detalle de respuestas</h3>
            <div class="detalle-preguntas">
    `;

    resultado.detalle.forEach((detalle, index) => {
        const claseEstado = detalle.enBlanco ? 'blanco' : (detalle.esCorrecta ? 'correcto' : 'incorrecto');
        const iconoEstado = detalle.enBlanco ? '⚪' : (detalle.esCorrecta ? '✅' : '❌');

        html += `
            <div class="detalle-item ${claseEstado}">
                <div class="detalle-header">
                    <span class="detalle-numero">${iconoEstado} Pregunta ${index + 1}</span>
                </div>
                <p class="detalle-enunciado">${detalle.pregunta}</p>
        `;

        // Mostrar opciones con indicadores
        detalle.opciones.forEach((opcion, opcionIndex) => {
            const valorOpcion = opcionIndex + 1;
            const esRespuestaUsuario = valorOpcion === detalle.respuestaUsuario;
            const esRespuestaCorrecta = valorOpcion === detalle.respuestaCorrecta;

            let claseOpcion = 'detalle-opcion';
            let marcador = '';

            if (esRespuestaCorrecta) {
                claseOpcion += ' opcion-correcta';
                marcador = '✓ ';
            }

            if (esRespuestaUsuario && !esRespuestaCorrecta) {
                claseOpcion += ' opcion-incorrecta';
                marcador = '✗ ';
            }

            if (esRespuestaUsuario && esRespuestaCorrecta) {
                marcador = '✓ ';
            }

            html += `<div class="${claseOpcion}">${marcador}${opcion}</div>`;
        });

        html += `</div>`;
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
