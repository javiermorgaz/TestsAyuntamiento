# Integración con Supabase - Documentación Técnica

Este documento detalla la integración técnica con Supabase, incluyendo el esquema de datos y los servicios de comunicación.

---

## 🏛️ Estructura de las Tablas

### 1. Tabla `tests` (Catálogo)
Almacena el índice de tests disponibles.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | INT | PRIMARY KEY |
| titulo | TEXT | Nombre del tema |
| fichero | TEXT | Nombre del archivo JSON (ej: `tema1.json`) |
| num_preguntas | INT | Total de preguntas del test |

### 2. Tabla `results` (Progreso y Resultados)
Almacena tanto los tests en curso como los finalizados.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | BIGINT | PRIMARY KEY (Auto-incremental) |
| test_id | INT | Relación con `tests.id` |
| status | ENUM | 'in_progress' o 'completed' |
| score_percentage | NUMERIC | Nota final (0-100) |
| total_correct | INT | Aciertos |
| total_questions | INT | Total de preguntas respondidas |
| answers_data | JSONB | Estado de las respuestas: `[{q_id, selected_option, is_correct, ...}]` |

---

## ⚙️ Configuración e Inicialización

### Inyección de Credenciales (Vite)
A diferencia de versiones anteriores, el cliente se inicializa usando variables de entorno nativas de Vite. No se requieren archivos de texto externos ni peticiones `fetch`.

**Point of Configuration**: `assets/js/supabase-config.js`

```javascript
// Cliente inicializado automáticamente vía ENV
const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
);
```

---

## 🛠️ Servicios Disponibles (ES Modules)

Con la nueva arquitectura modular (v3.0), los servicios ya no se exponen en el objeto global `window`. Se deben importar explícitamente desde sus respectivos módulos.

### 📚 Gestión de Tests (`supabase-service.js`)

#### `fetchTestsFromSupabase()`
Obtiene el catálogo completo de tests.

#### `fetchTestById(id)`
Obtiene los detalles de un test específico por su ID.

### 📝 Gestión de Resultados (`supabase-service.js`)

#### `fetchTestInProgress(testId)`
Recupera el estado actual de un test que el usuario no ha terminado.

#### `saveTestProgress(data)`
Guarda el estado actual del test (respuestas seleccionadas) sin finalizarlo.

#### `finishTest(data)`
Registra un test como completado y guarda la nota final.

#### `fetchTestHistory(testId)`
Obtiene los últimos intentos realizados para un tema específico.

---

## 🔄 Flujo de Sincronización Híbrida

La aplicación utiliza `dataService.js` como orquestador para decidir entre Supabase (Nube) y LocalStorage (Local):

1.  **Prioridad Nube**: Siempre se intenta leer/escribir en Supabase primero.
2.  **Fallback Transparente**: Si Supabase no está disponible (offline o sin claves), la aplicación degrada automáticamente a LocalStorage sin interrumpir al usuario.
3.  **Sincronización al Inicio**: Al cargar un test, se busca la versión más reciente del progreso en ambos sistemas.

---

## 🧪 Verificación de Integridad

El archivo `db/schema.sql` contiene la definición exacta de las tablas. Los tests unitarios (`tests/supabaseService.test.js`) validan que cualquier cambio en el código siga siendo compatible con este esquema maestro.

---

**Última revisión**: Versión 2.2.4 (Diciembre 2025)
