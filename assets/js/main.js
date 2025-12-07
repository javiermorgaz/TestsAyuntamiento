// assets/js/main.js

const TESTS_INDEX_URL = './data/tests_index.json';
const testsListSection = document.getElementById('tests-list');
const testsContainer = document.getElementById('tests-container');

/**
 * Carga el archivo de índice de tests y llama a la función de renderizado.
 */
async function cargarListadoTests() {
    try {
        testsContainer.innerHTML = '<p>Cargando tests...</p>';

        const response = await fetch(TESTS_INDEX_URL);

        if (!response.ok) {
            throw new Error(`Error al cargar el índice: ${response.status}`);
        }

        const tests = await response.json();

        renderizarListado(tests);

    } catch (error) {
        console.error("Error crítico al cargar listado:", error);
        testsContainer.innerHTML =
            '<p style="color:red;">⚠️ No se pudieron cargar los tests. Revisa la consola y las rutas de los archivos JSON.</p>';
    }
}

/**
 * Genera el HTML para mostrar la lista de tests disponibles.
 * @param {Array<Object>} tests - Array de objetos de tests.
 */
function renderizarListado(tests) {
    if (tests.length === 0) {
        testsContainer.innerHTML = '<p>No hay tests disponibles.</p>';
        return;
    }

    // Obtener resultados anteriores del localStorage
    const todosLosResultados = obtenerResultados();

    let htmlContent = '<ul>';

    tests.forEach(test => {
        // Filtrar resultados de este test específico
        const resultadosTest = todosLosResultados.filter(r => r.testId === test.id);

        let historialHTML = '';

        if (resultadosTest.length > 0) {
            // Mostrar los últimos 3 resultados
            const ultimosResultados = resultadosTest.slice(-3).reverse();

            historialHTML = '<div class="historial-resultados">';
            historialHTML += '<p class="historial-titulo">Últimos intentos:</p>';

            ultimosResultados.forEach(resultado => {
                const fecha = new Date(resultado.fecha).toLocaleDateString('es-ES');
                const porcentaje = ((resultado.aciertos / resultado.total) * 100).toFixed(0);
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
    });

    htmlContent += '</ul>';
    testsContainer.innerHTML = htmlContent;
}


// Función para iniciar el test
function iniciarTest(testId, fileName) {
    // Ocultar la lista y mostrar la vista del test
    testsListSection.style.display = 'none';
    document.getElementById('test-view').style.display = 'block';
    document.getElementById('resultado-view').style.display = 'none';

    // Scroll al inicio
    window.scrollTo(0, 0);

    // Llamar a la función que cargará el test real (definida en test.js)
    cargarTest(testId, fileName);
}

// Ejecutar la carga al iniciar la aplicación
cargarListadoTests();
