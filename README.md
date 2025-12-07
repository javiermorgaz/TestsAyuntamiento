# App de Tests de Oposiciones

Aplicación web para practicar tests de oposiciones de ayuntamiento.

## Características

- ✅ Listado dinámico de tests
- ✅ Vista completa de todas las preguntas
- ✅ Corrección automática con detalle
- ✅ Historial de resultados (localStorage)
- ✅ Diseño responsive

## Estructura del Proyecto

```
/windsurf-project
├── index.html              # Página principal
├── assets/
│   ├── css/
│   │   └── style.css       # Estilos
│   └── js/
│       ├── main.js         # Lógica principal y listado
│       ├── test.js         # Lógica del test y corrección
│       └── storage.js      # Gestión de localStorage
├── data/
│   ├── tests_index.json    # Índice de tests (autogenerado)
│   └── tests/              # Carpeta con todos los tests
│       ├── bloque1.json    # Test del Bloque I
│       ├── bloque2.json    # Test del Bloque II
│       └── bloque3.json    # Test del Bloque III
└── scripts/
    └── build-index.js      # Script para generar el índice
```

## Cómo Añadir Nuevos Tests

### 1. Crear el archivo JSON del test

Crea un nuevo archivo en `/data/tests/` siguiendo este formato:

```json
{
  "id": 4,
  "titulo": "Nombre del Test",
  "ley": "Referencia a la ley o normativa (opcional)",
  "preguntas": [
    {
      "id_p": 1,
      "enunciado": "¿Pregunta?",
      "opciones": ["Opción 1", "Opción 2", "Opción 3", "Opción 4"],
      "respuesta_correcta": 2
    }
  ]
}
```

**Importante:**
- `id`: Identificador único del test
- `titulo`: Título descriptivo del test/bloque
- `ley`: (Opcional) Referencia a la ley o normativa que cubre el test
- `respuesta_correcta`: Índice basado en 1 (1 = primera opción)

### 2. Ejecutar el script de generación de índice

```bash
npm run build-index
```

Este comando:
- Escanea todos los archivos `bloque*.json` y `test*.json` en `/data/tests/`
- Extrae metadata (id, título, número de preguntas)
- Genera/actualiza `tests_index.json` automáticamente en `/data/`

### 3. Verificar y subir cambios

```bash
git add .
git commit -m "Add new test"
git push
```

## Desarrollo Local

### Requisitos

- Node.js (para ejecutar el script de build)
- Un servidor local (Live Server, Python, etc.)

### Ejecutar localmente

**Opción 1: Live Server (VSCode)**
```
Click derecho en index.html → Open with Live Server
```

**Opción 2: Python**
```bash
python3 -m http.server 8000
# Abre: http://localhost:8000
```

**Opción 3: Node.js**
```bash
npx http-server -p 8000
```

## Despliegue en GitHub Pages

1. Sube el proyecto a GitHub
2. Ve a Settings → Pages
3. Selecciona la rama `main` y carpeta `/ (root)`
4. GitHub Pages generará una URL automáticamente

## Formato de Tests

### Estructura de un Test Individual

```json
{
  "id": 1,
  "titulo": "Título del Test",
  "ley": "Referencia a la ley (opcional)",
  "preguntas": [
    {
      "id_p": 1,
      "enunciado": "Texto de la pregunta",
      "opciones": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "respuesta_correcta": 1
    }
  ]
}
```

### Estructura del Índice (autogenerado)

```json
[
  {
    "id": 1,
    "titulo": "Nombre del Test",
    "ley": "Referencia a la ley",
    "fichero": "tests/bloque1.json",
    "num_preguntas": 25
  }
]
```

## Funcionalidades

### Almacenamiento Local

Los resultados se guardan en `localStorage` del navegador:
- Historial de intentos por test
- Respuestas detalladas
- Fecha y puntuación

### Corrección

Al finalizar un test, se muestra:
- Número de aciertos, errores y blancos
- Porcentaje de acierto
- Detalle pregunta por pregunta con:
  - Tu respuesta (si es incorrecta, en rojo)
  - Respuesta correcta (en verde)

## Próximas Mejoras

- [ ] Integración con Supabase para multi-dispositivo
- [ ] Generador automático de tests con IA
- [ ] Estadísticas avanzadas
- [ ] Modo examen con tiempo límite
- [ ] Exportar resultados a PDF

## Licencia

MIT
