// assets/js/main.js

const TESTS_INDEX_URL = './data/tests_index.json';
const testsListSection = document.getElementById('tests-list');
const testsContainer = document.getElementById('tests-container');

/**
 * Carga el archivo de índice de tests y llama a la función de renderizado.
 * Usa dataService para intentar Supabase primero, luego fallback a JSON local.
 */
async function cargarListadoTests() {
    try {
        testsContainer.innerHTML = '<p>Cargando tests...</p>';

        // Usar dataService (intenta Supabase → fallback JSON)
        const tests = await obtenerTests();

        await renderizarListado(tests);

    } catch (error) {
        console.error("Error crítico al cargar listado:", error);
        testsContainer.innerHTML =
            '<p style="color:red;">⚠️ No se pudieron cargar los tests. Revisa la consola y las rutas de los archivos JSON.</p>';
    }
}

/**
 * Genera el HTML para mostrar la lista de tests disponibles.
 * Ahora carga el historial desde Supabase con fallback a localStorage.
 * @param {Array<Object>} tests - Array de objetos de tests.
 */
async function renderizarListado(tests) {
    if (tests.length === 0) {
        testsContainer.innerHTML = '<p>No hay tests disponibles.</p>';
        return;
    }

    let htmlContent = '<ul>';

    // Procesar cada test de forma asíncrona
    for (const test of tests) {
        // Obtener historial desde dataService (Supabase → localStorage)
        const resultadosTest = await obtenerHistorial(test.id, 3);

        let historialHTML = '';

        if (resultadosTest.length > 0) {
            historialHTML = '<div class="historial-resultados">';
            historialHTML += '<p class="historial-titulo">Últimos intentos:</p>';

            resultadosTest.forEach(resultado => {
                const fecha = new Date(resultado.fecha).toLocaleDateString('es-ES');
                const porcentaje = parseFloat(resultado.porcentaje).toFixed(0);
                historialHTML += `
                    <span class="badge-resultado">
                        ${fecha}: ${resultado.aciertos}/${resultado.total} (${porcentaje}%)
                    </span>
                `;
            });

            historialHTML += '</div>';
        }

        htmlContent += `
            <li>
                <h3>${test.titulo}</h3>
                <p>Preguntas: ${test.num_preguntas}</p>
                ${historialHTML}
                <button onclick="iniciarTest(${test.id}, '${test.fichero}')">
                    Comenzar Test
                </button>
            </li>
        `;
    }

    htmlContent += '</ul>';
    testsContainer.innerHTML = htmlContent;
}


// Función para iniciar el test
// Ahora detecta si hay progreso anterior
async function iniciarTest(testId, fileName) {
    try {
        // Buscar progreso existente en Supabase
        const progreso = await buscarProgresoTest(testId);

        if (progreso) {
            const respondidas = progreso.answers_data.filter(a => a !== null).length;
            const continuar = confirm(
                '🔄 Tienes un test en progreso.\n\n' +
                `Progreso: ${respondidas}/${progreso.total_questions} preguntas respondidas\n\n` +
                '¿Quieres continuar donde lo dejaste?'
            );

            if (continuar) {
                // Continuar test con progreso guardado
                testsListSection.style.display = 'none';
                document.getElementById('test-view').style.display = 'block';
                document.getElementById('resultado-view').style.display = 'none';
                window.scrollTo(0, 0);

                await cargarTestConProgreso(testId, fileName, progreso);
                return;
            } else {
                // Eliminar progreso y empezar de nuevo
                await eliminarProgreso(progreso.id);
                console.log('🗑️ Progreso eliminado, empezando test nuevo');
            }
        }
    } catch (error) {
        console.warn('⚠️ Error al verificar progreso:', error);
    }

    // Continuar con flujo normal (test nuevo)
    testsListSection.style.display = 'none';
    document.getElementById('test-view').style.display = 'block';
    document.getElementById('resultado-view').style.display = 'none';
    window.scrollTo(0, 0);

    // Llamar a la función que cargará el test real (definida en test.js)
    cargarTest(testId, fileName);
}

// Ejecutar la carga al iniciar la aplicación
cargarListadoTests();
