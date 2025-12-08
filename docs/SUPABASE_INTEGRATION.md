# Integración con Supabase - Documentación

## Estructura de las Tablas

### 1. Tabla `tests` (Datos Estáticos/Índice)

Almacena el catálogo de tests disponibles.

| Columna | Tipo | Propiedades | Descripción |
|---------|------|-------------|-------------|
| id | INT | PRIMARY KEY | Identificador único del test |
| titulo | TEXT | NOT NULL | Nombre completo del test |
| fichero | TEXT | NOT NULL | Ruta al archivo JSON con las preguntas |
| num_preguntas | INT | NOT NULL | Cantidad total de preguntas |

### 2. Tabla `results` (Datos Dinámicos/Progreso)

Almacena el historial de intentos y el progreso actual de los tests.

| Columna | Tipo | Propiedades | Descripción |
|---------|------|-------------|-------------|
| id | BIGINT | PRIMARY KEY, AUTO | ID único del intento |
| test_id | INT | FOREIGN KEY | Referencia al test en tabla `tests` |
| status | test_status (ENUM) | NOT NULL | Estado: 'in_progress' o 'completed' |
| score_percentage | NUMERIC | NULL | Porcentaje de aciertos (si está completado) |
| total_correct | INT | NULL | Respuestas correctas (si está completado) |
| total_questions | INT | NULL | Total de preguntas contestadas |
| answers_data | JSONB | NOT NULL | Array con las respuestas: `[{q_id, selected_option, ...}]` |

## API de Servicios

### Configuración

El archivo `supabase-config.js` inicializa el cliente de Supabase cargando las credenciales desde un archivo externo (`supabaseAuth.txt` ubicado fuera del directorio del proyecto):

**IMPORTANTE:** Las credenciales NO están hardcoded en el código. Se cargan dinámicamente desde un archivo fuera del directorio del proyecto para mayor seguridad.

```javascript
// Inicializar cliente (async)
const client = await getSupabaseClient();
```

El archivo de credenciales debe tener el formato:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_clave_aqui
```

o

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu_service_key_aqui
```

### Servicios Disponibles

#### 📚 Gestión de Tests

##### `obtenerTestsDesdeSupabase()`
Obtiene todos los tests disponibles ordenados por ID.

```javascript
const tests = await obtenerTestsDesdeSupabase();
// Retorna: [{id, titulo, fichero, num_preguntas}, ...]
```

##### `obtenerTestPorId(testId)`
Obtiene un test específico por su ID.

```javascript
const test = await obtenerTestPorId(1);
// Retorna: {id, titulo, fichero, num_preguntas}
```

---

#### 📝 Gestión de Progreso y Resultados

##### `obtenerTestEnProgreso(testId)`
Busca si existe un test en progreso para continuar donde se dejó.

```javascript
const progreso = await obtenerTestEnProgreso(1);
// Retorna: {id, test_id, status, answers_data, ...} o null
```

##### `guardarProgresoTest(progressData)`
Guarda o actualiza el progreso de un test.

```javascript
// Crear nuevo progreso
await guardarProgresoTest({
    test_id: 1,
    answers_data: [
        {q_id: 1, selected_option: 'A'},
        {q_id: 2, selected_option: 'B'}
    ],
    total_questions: 10
});

// Actualizar progreso existente
await guardarProgresoTest({
    id: 123,  // ID del resultado en progreso
    answers_data: [...],
    total_questions: 10
});
```

##### `completarTest(resultData)`
Marca un test como completado y guarda la nota final.

```javascript
await completarTest({
    id: 123,  // ID del resultado en progreso (opcional)
    test_id: 1,
    total_correct: 8,
    total_questions: 10,
    score_percentage: 80.0,
    answers_data: [
        {q_id: 1, selected_option: 'A', is_correct: true},
        {q_id: 2, selected_option: 'B', is_correct: false},
        // ...
    ]
});
```

##### `obtenerHistorialTest(testId, limit = 10)`
Obtiene el historial de resultados completados de un test específico.

```javascript
const historial = await obtenerHistorialTest(1, 5);
// Retorna: últimos 5 resultados del test 1
```

##### `obtenerTodosLosResultados()`
Obtiene todos los resultados completados de todos los tests.

```javascript
const todosLosResultados = await obtenerTodosLosResultados();
// Útil para estadísticas generales
```

##### `eliminarProgresoTest(resultId)`
Elimina un resultado en progreso (para empezar de nuevo).

```javascript
await eliminarProgresoTest(123);
// Retorna: true si se eliminó correctamente
```

---

## Flujo de Trabajo Típico

### 1️⃣ Cargar Lista de Tests

```javascript
async function cargarTests() {
    try {
        // Obtener tests desde Supabase
        const tests = await obtenerTestsDesdeSupabase();

        // Renderizar en la interfaz
        renderizarListado(tests);
    } catch (error) {
        console.error('Error:', error);
        // Fallback a archivo local si falla Supabase
        const response = await fetch('./data/tests_index.json');
        const tests = await response.json();
        renderizarListado(tests);
    }
}
```

### 2️⃣ Iniciar o Continuar un Test

```javascript
async function iniciarTest(testId) {
    try {
        // Verificar si hay progreso guardado
        const progreso = await obtenerTestEnProgreso(testId);

        if (progreso) {
            // Preguntar al usuario si quiere continuar
            const continuar = confirm('Tienes un test en progreso. ¿Quieres continuar?');

            if (continuar) {
                // Restaurar respuestas desde answers_data
                cargarTestConProgreso(testId, progreso.answers_data, progreso.id);
            } else {
                // Eliminar progreso y empezar de nuevo
                await eliminarProgresoTest(progreso.id);
                cargarTestNuevo(testId);
            }
        } else {
            // Empezar test nuevo
            cargarTestNuevo(testId);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}
```

### 3️⃣ Guardar Progreso Periódicamente

```javascript
let progresoId = null; // ID del resultado en progreso

async function guardarProgresoActual() {
    const respuestas = obtenerRespuestasActuales(); // Función que obtiene las respuestas del formulario

    try {
        const resultado = await guardarProgresoTest({
            id: progresoId, // null la primera vez
            test_id: testIdActual,
            answers_data: respuestas,
            total_questions: totalPreguntas
        });

        // Guardar el ID para futuras actualizaciones
        if (!progresoId) {
            progresoId = resultado.id;
        }

        console.log('✅ Progreso guardado');
    } catch (error) {
        console.error('Error al guardar:', error);
    }
}

// Guardar progreso cada 30 segundos
setInterval(guardarProgresoActual, 30000);
```

### 4️⃣ Finalizar y Corregir Test

```javascript
async function finalizarTest() {
    const respuestas = obtenerRespuestasActuales();
    const { correctas, totalPreguntas } = corregirRespuestas(respuestas);
    const porcentaje = (correctas / totalPreguntas) * 100;

    try {
        await completarTest({
            id: progresoId, // Si existía progreso
            test_id: testIdActual,
            total_correct: correctas,
            total_questions: totalPreguntas,
            score_percentage: porcentaje,
            answers_data: respuestas // Con información de corrección
        });

        console.log('✅ Test completado');
        mostrarResultados(correctas, totalPreguntas, porcentaje);
    } catch (error) {
        console.error('Error al completar:', error);
    }
}
```

### 5️⃣ Mostrar Historial en la Lista

```javascript
async function renderizarConHistorial(test) {
    try {
        // Obtener últimos 3 intentos
        const historial = await obtenerHistorialTest(test.id, 3);

        // Renderizar historial
        historial.forEach(resultado => {
            console.log(`${resultado.score_percentage}% - ${resultado.total_correct}/${resultado.total_questions}`);
        });
    } catch (error) {
        console.error('Error:', error);
    }
}
```

---

## Estructura de `answers_data`

El campo `answers_data` es un array JSON con la siguiente estructura:

### Durante el Progreso (in_progress)

```json
[
  {
    "q_id": 1,
    "selected_option": "A"
  },
  {
    "q_id": 2,
    "selected_option": "C"
  }
]
```

### Después de Completar (completed)

```json
[
  {
    "q_id": 1,
    "selected_option": "A",
    "is_correct": true,
    "correct_option": "A"
  },
  {
    "q_id": 2,
    "selected_option": "C",
    "is_correct": false,
    "correct_option": "B"
  }
]
```

---

## Manejo de Errores

Todas las funciones lanzan errores que deben ser capturados:

```javascript
try {
    const tests = await obtenerTestsDesdeSupabase();
} catch (error) {
    console.error('Error al cargar tests:', error);
    // Implementar fallback o mostrar mensaje al usuario
}
```

---

## Sincronización entre Dispositivos

El sistema permite sincronización automática:

1. **Usuario inicia test en dispositivo A** → Se crea registro con `status: 'in_progress'`
2. **Usuario abre app en dispositivo B** → Se detecta el progreso y puede continuar
3. **Usuario completa en dispositivo B** → Se actualiza a `status: 'completed'`

---

## Migración desde localStorage

Si ya tienes datos en localStorage, puedes migrarlos:

```javascript
async function migrarResultadosASupabase() {
    const resultadosLocales = obtenerResultados(); // Función de storage.js

    for (const resultado of resultadosLocales) {
        await completarTest({
            test_id: resultado.testId,
            total_correct: resultado.aciertos,
            total_questions: resultado.total,
            score_percentage: (resultado.aciertos / resultado.total) * 100,
            answers_data: resultado.respuestas || []
        });
    }

    console.log('✅ Migración completada');
}
```

---

## Notas Importantes

1. **Credenciales**: Las credenciales se cargan desde un archivo externo (`../../supabaseAuth.txt` relativo al directorio del proyecto). Este archivo NO debe estar en el repositorio git (está incluido en `.gitignore`).

2. **Modo Offline**: Si no se pueden cargar las credenciales, la aplicación automáticamente funciona en modo offline (sin sincronización con Supabase). Los datos se guardarán solo localmente.

3. **Row Level Security (RLS)**: Asegúrate de configurar políticas de seguridad en Supabase para que los usuarios solo puedan ver/editar sus propios resultados.

4. **Fallback**: Todas las funciones de servicio devuelven `null` si Supabase no está disponible. Implementa siempre un fallback a localStorage.

5. **Performance**: El servicio usa `console.log` para debugging. Considera eliminar en producción para mejorar performance.

6. **CORS**: Si ejecutas la app desde `file://`, es posible que tengas problemas de CORS al cargar el archivo de credenciales. Se recomienda usar un servidor local (como Live Server de VS Code).
