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

        // Buscar si hay progreso en curso
        const progreso = await buscarProgresoTest(test.id);

        let historialHTML = '';
        let progresoHTML = '';
        let botonHTML = '';
        let botonResetHTML = '';

        // Mostrar indicador de progreso si existe
        if (progreso) {
            const respondidas = progreso.answers_data.filter(a => a !== null).length;
            progresoHTML = `
                <div class="progreso-indicator">
                    <span class="badge-progreso">
                        📝 En progreso: ${respondidas}/${progreso.total_questions} preguntas
                    </span>
                </div>
            `;

            // Botón para continuar (color diferente)
            botonHTML = `
                <button class="btn-continuar" onclick="iniciarTest(${test.id}, '${test.fichero}')">
                    Continuar Test
                </button>
            `;

            // Botón para resetear
            botonResetHTML = `
                <button class="btn-reset" onclick="resetearTest(${test.id})">
                    🔄 Empezar de Nuevo
                </button>
            `;
        } else {
            // Botón normal para comenzar
            botonHTML = `
                <button onclick="iniciarTest(${test.id}, '${test.fichero}')">
                    Comenzar Test
                </button>
            `;
        }

        // Mostrar historial de intentos completados
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
                ${progresoHTML}
                ${historialHTML}
                <div class="test-actions">
                    ${botonHTML}
                    ${botonResetHTML}
                </div>
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
            const continuar = await showConfirm(
                `🔄 Tienes un test en progreso.\n\nProgreso: ${respondidas}/${progreso.total_questions} preguntas respondidas\n\n¿Quieres continuar donde lo dejaste?`,
                'Test en Progreso'
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

/**
 * Resetea el progreso de un test específico
 * Muestra confirmación antes de eliminar
 * @param {number} testId - ID del test a resetear
 */
async function resetearTest(testId) {
    try {
        const confirmar = await showConfirm(
            '¿Estás seguro de que quieres eliminar el progreso de este test?\n\nEsta acción no se puede deshacer.',
            'Confirmar Reseteo'
        );

        if (confirmar) {
            // Buscar el progreso actual
            const progreso = await buscarProgresoTest(testId);

            if (progreso) {
                // Eliminar el progreso
                await eliminarProgreso(progreso.id);

                // Mostrar mensaje de éxito
                await showModal('El progreso del test ha sido eliminado correctamente.', 'Test Reseteado');

                // Recargar el listado para actualizar la interfaz
                await cargarListadoTests();
            }
        }
    } catch (error) {
        console.error('Error al resetear test:', error);
        await showModal('Hubo un error al resetear el test. Por favor, inténtalo de nuevo.', 'Error');
    }
}

// Ejecutar la carga al iniciar la aplicación
cargarListadoTests();
