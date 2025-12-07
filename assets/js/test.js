// assets/js/test.js

/**
 * Lógica para cargar y ejecutar un test individual
 * Muestra todas las preguntas a la vez y permite corregir al final
 */

// Variables globales del test actual
let currentTest = null;
let userResponses = []; // Array para almacenar las respuestas del usuario

/**
 * Función para volver al listado de tests
 * Definida aquí para que esté disponible cuando se añadan los event listeners
 */
function volverAlListado() {
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

    } catch (error) {
        console.error("Error al cargar el test:", error);
        questionsContainer.innerHTML = '<p style="color:red;">Error al cargar el test. Verifica la consola.</p>';
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
 * Guarda la respuesta seleccionada por el usuario
 * @param {number} preguntaIndex - Índice de la pregunta
 * @param {number} opcionSeleccionada - Índice de la opción (1-based)
 */
function guardarRespuesta(preguntaIndex, opcionSeleccionada) {
    userResponses[preguntaIndex] = opcionSeleccionada;
}

/**
 * Corrige el test y calcula la puntuación
 */
function corregirTest() {
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

    const resultado = {
        testId: currentTest.id,
        titulo: currentTest.titulo,
        fecha: new Date().toISOString(),
        aciertos: aciertos,
        errores: errores,
        blancos: blancos,
        total: currentTest.preguntas.length,
        respuestas: [...userResponses],
        detalle: detalleRespuestas
    };

    // Guardar en localStorage
    guardarResultado(resultado);

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
    btnFinish.addEventListener('click', corregirTest);
}

if (btnVolverInicio) {
    btnVolverInicio.addEventListener('click', volverAlListado);
}

if (btnVolverInicioResultado) {
    btnVolverInicioResultado.addEventListener('click', volverAlListado);
}
