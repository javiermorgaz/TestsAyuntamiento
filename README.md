# 📚 App de Tests de Oposiciones

Aplicación web para realizar tests de preparación para oposiciones de ayuntamientos.

---

## 🎯 Características

### Funcionalidades Actuales
- ✅ **17 temas** de oposiciones (499 preguntas totales)
- ✅ **Tests interactivos** con preguntas de opción múltiple
- ✅ **Corrección automática** con detalle de aciertos y errores
- ✅ **Historial de intentos** guardado localmente y en la nube
- ✅ **Modo híbrido** - online (Supabase) + offline (localStorage)
- ✅ **Sincronización en la nube** con Supabase
- ✅ **Auto-guardado** de progreso en el navegador (cada 30s, al cambiar respuesta y al volver al inicio)
- ✅ **Continuación de tests** - retomar donde lo dejaste desde cualquier dispositivo
- ✅ **Sincronización entre dispositivos** vía Supabase
- ✅ **Modo Slider (Presentación)** - vista tipo diapositiva optimizada para móviles
- ✅ **Sincronización Bi-direccional** - cambia de vista sin perder tu posición
- ✅ **Seguridad Robusta** - Gestión de claves vía variables de entorno (`.env`) y GitHub Secrets
- ✅ **Estética Premium** - Modo Oscuro profesional ("Deep Charcoal") con Glassmorphism avanzado


### Futuras Mejoras
- 📊 Estadísticas avanzadas por tema
- 📖 Modo de estudio (solo preguntas falladas)
- ⏱️ Cronómetro y límite de tiempo

---

## 📦 Contenido

### Temas Disponibles

1. **Tema 1. La Constitución Española (I)** (40 preguntas)
2. **Tema 2. La Constitución Española (II)** (43 preguntas)
3. **Tema 3. La Constitución Española (III)** (42 preguntas)
4. **Tema 4. El Estatuto de Autonomía para Andalucía** (16 preguntas)
5. **Tema 5. La Unión Europea: Instituciones y Libre Circulación** (20 preguntas)
6. **Tema 6. Ley Reguladora de las Bases del Régimen Local (LBRL)** (41 preguntas)
7. **Tema 7. Ley 39/2015 (I): Interesados, Registros, Plazos y Copias** (36 preguntas)
8. **Tema 8. Ley 39/2015 (II): Actos Administrativos, Notificación y Vicios** (39 preguntas)
9. **Tema 9. Ley 39/2015 (III): Los Recursos Administrativos** (31 preguntas)
10. **Tema 10. Ley Orgánica 3/2018 (LOPD-GDD): Principios y Derechos** (18 preguntas)
11. **Tema 11. Ley 40/2015 (LRJSP): Órganos, Competencia y R. Patrimonial** (24 preguntas)
12. **Tema 12. Ley 19/2013 (Transparencia): Publicidad Activa y Acceso a la Información** (28 preguntas)
13. **Tema 13. Organización y Funcionamiento del Ayuntamiento de Sevilla** (12 preguntas)
14. **Tema 14. Personal al Servicio de Entidades Locales (I): Clases, Derechos y Acceso** (32 preguntas)
15. **Tema 15. Personal al Servicio de Entidades Locales (II): Retribuciones, Movilidad y Disciplinario** (35 preguntas)
16. **Tema 16. Igualdad y Violencia de Género** (17 preguntas)
17. **Tema 17. El Presupuesto Municipal** (25 preguntas)

**Total**: 499 preguntas distribuidas en 17 temas

---

## 🚀 Uso

### Abrir la Aplicación

#### Opción 1: Desarrollo local (Recomendado)
```bash
# Activa pnpm si aún no lo tienes disponible
corepack enable

# Instala las dependencias
pnpm install

# Inicia el servidor de desarrollo (Vite)
pnpm dev
```

#### Opción 2: Construcción para producción
```bash
# Genera la carpeta dist/ optimizada
pnpm build

# Previsualiza el resultado localmente
pnpm preview
```

Luego abre en el navegador:
- **Dev**: `http://localhost:5173`
- **Preview**: `http://localhost:4173`

### Realizar un Test

1. **Selecciona un tema** de la lista principal
2. **Responde las preguntas** seleccionando una opción (A, B o C)
3. **Finaliza y corrige** cuando hayas terminado
4. **Revisa el resultado** con el detalle de cada pregunta

### Historial de Intentos

La aplicación guarda automáticamente tus últimos intentos de cada test. Puedes ver:
- Fecha del intento
- Número de aciertos / total
- Porcentaje de acierto

Además, si sales de un test sin finalizarlo, el progreso en curso se conserva en `localStorage` y aparece como "Continuar Test" al volver al listado. Supabase añade sincronización entre dispositivos cuando está configurado.

---

## 🗄️ Estructura del Proyecto

```
TestsAyuntamiento/
├── .github/                        # Workflows de CI/CD
│   └── workflows/
│       ├── tests.yml               # Tests unitarios + visuales
│       └── deploy.yml              # Despliegue a GitHub Pages tras CI verde
├── src/
│   ├── index.html                  # Punto de entrada de Vite
│   ├── styles/
│   │   └── style.css               # Estilos principales (Tailwind CSS v4)
│   ├── core/                       # Lógica de negocio
│   │   ├── stateManager.js         # Gestión de estado centralizado
│   │   ├── testEngine.js           # Motor de evaluación de tests
│   │   └── test.js                 # Orquestador principal
│   ├── services/                   # Capa de datos y APIs
│   │   ├── dataService.js          # Punto de entrada de datos
│   │   ├── dataService.provider.js # Selección de datos reales o mock
│   │   ├── realDataService.js      # Abstracción híbrida (Supabase + localStorage)
│   │   ├── supabase-service.js     # API de Supabase
│   │   └── storage.js              # Persistencia local (localStorage)
│   ├── ui/                         # Interfaz de usuario
│   │   ├── main.js                 # Inicialización de la app
│   │   ├── testRenderer.js         # Renderizado del DOM
│   │   ├── modal.js                # Diálogos modales
│   │   └── darkMode.js             # Toggle de tema oscuro
│   └── config/                     # Configuración
│       └── supabase.js             # Cliente Supabase vía variables Vite
├── public/                         # Assets estáticos servidos por Vite
│   ├── data/                       # Índice y contenido de tests (JSON)
│   └── ui/theme-init.js            # Script temprano para evitar FOUC
├── db/                             # Esquema SQL de referencia
├── tests/                          # Tests unitarios y visuales
│   ├── e2e/                        # Playwright + snapshots
│   └── playwright.config.js        # Configuración de tests visuales
├── .env                            # Variables de entorno (No incluido en Git)
├── package.json                    # Dependencias y scripts
├── pnpm-lock.yaml                  # Lockfile reproducible de pnpm
├── pnpm-workspace.yaml             # Aprobación de builds de dependencias pnpm
├── vite.config.js                  # Configuración de Vite + path aliases
├── README.md                       # Este archivo
└── docs/
    ├── SUPABASE_INTEGRATION.md     # Documentación técnica
    ├── SUPABASE_CREDENTIALS.md     # Guía de credenciales
    └── SECURITY.md                 # Gestión de credenciales
```

---

## 🔧 Para Desarrolladores

### Requisitos
- Node.js 24 o superior (recomendado por `pnpm@11`)
- Cuenta de Supabase (opcional, para sincronización en la nube)

### Instalación

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd TestsAyuntamiento

# Activar pnpm mediante Corepack
corepack enable

# Instalar dependencias
pnpm install
```

Esto instalará también las dependencias de desarrollo necesarias para los tests (Jest).

### Script de Sincronización

El script `build-index.js` genera automáticamente el índice de tests y sincroniza con Supabase:

```bash
pnpm build-index
```

**Qué hace**:
1. Lee todos los archivos JSON de `public/data/tests/`
2. Genera `public/data/tests_index.json` con metadatos
3. Sincroniza con la tabla `tests` de Supabase (si está configurado)

**Configuración de credenciales**:

Para que el script pueda sincronizar con Supabase, necesitas crear un archivo `.env` en la raíz del proyecto:

```bash
# Copia el archivo de ejemplo
cp .env.example .env

# Edita .env y añade tus credenciales de Supabase
```

El archivo `.env` debe contener:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_publishable_key
SUPABASE_SERVICE_KEY=tu_service_key  # Solo para el script
```

> **Nota**: El archivo `.env` está en `.gitignore` y nunca se subirá al repositorio. Las credenciales para producción se gestionan mediante GitHub Secrets.

### Agregar Nuevos Tests

1. **Crear archivo JSON** en `public/data/tests/` con el formato:

```json
{
  "id": 18,
  "titulo": "Tema 18. Nuevo Tema",
  "preguntas": [
    {
      "id_p": 1,
      "enunciado": "¿Pregunta aquí?",
      "opciones": [
        "Opción A",
        "Opción B",
        "Opción C"
      ],
      "respuesta_correcta": 1
    }
  ]
}
```

2. **Ejecutar script**:
```bash
pnpm build-index
```

3. **Verificar** que el nuevo test aparece en la lista

---

## 🗄️ Base de Datos (Supabase)

Las credenciales de Supabase se gestionan mediante variables de entorno en un archivo `.env` en la raíz del proyecto (excluido de Git):

```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_publishable_key_aqui
```

Para despliegues en GitHub Pages, estas claves se inyectan de forma segura a través de **GitHub Secrets**.

Ver [SECURITY.md](./docs/SECURITY.md) para más detalles.

### Tablas

#### `tests` - Catálogo de tests
```sql
id          SERIAL PRIMARY KEY
titulo      TEXT NOT NULL
preguntas   JSONB NOT NULL
created_at  TIMESTAMP WITH TIME ZONE
```

#### `results` - Progreso y resultados
```sql
id                  BIGINT PRIMARY KEY
test_id             INT (FK → tests.id)
status              TEXT ('in_progress' | 'completed')
answers_data        JSONB
total_questions     INT
total_correct       INT
score_percentage    NUMERIC
created_at          TIMESTAMP WITH TIME ZONE
updated_at          TIMESTAMP WITH TIME ZONE
```

Ver [SUPABASE_INTEGRATION.md](./docs/SUPABASE_INTEGRATION.md) para la API completa.

### ⚠️ Importante: Sincronización de Esquema
El archivo `db/schema.sql` actúa como **contrato** para los tests unitarios. Este archivo **NO** se sincroniza automáticamente con Supabase.

**Si modificas la estructura de la base de datos en Supabase:**
1. Actualiza manualmente `db/schema.sql` para reflejar los cambios.
2. Ejecuta `pnpm test` para asegurar que el código sigue siendo compatible con el nuevo esquema.

---

## 🧪 Testing

El proyecto cuenta con **tests unitarios** para garantizar la estabilidad del código, especialmente en la capa de datos y la integración con la base de datos.
- **Librería**: [Jest](https://jestjs.io/)
- **Entorno**: JSDOM (para simular el navegador)

### Ejecutar Tests

Para ejecutar todos los tests disponibles:

```bash
pnpm test
```

### Estructura de Tests
- `tests/dataService.test.js`: Verifica la lógica de `src/services/dataService.js` y su fallback local.
- `tests/provider.test.js`: Verifica la selección entre datos reales y mocks.
- `tests/supabaseService.test.js`: Verifica que `src/services/supabase-service.js` cumple con el esquema de la base de datos (`db/schema.sql`).
- `tests/stateManager.test.js`: Verifica el estado centralizado de la app.
- `tests/testEngine.test.js`: Verifica la evaluación de respuestas y puntuaciones.
- `tests/sliderLogic.test.js`: Verifica la resiliencia de la sincronización y la adaptación de altura del modo Slider.
- `tests/smartResumption.test.js`: Verifica la restauración de progreso en la primera pregunta pendiente.

### Tests Visuales (E2E)
- **Librería**: [Playwright](https://playwright.dev/)
- **Objetivo**: Detectar regresiones visuales (pixel-perfect) y errores de integración.
- **Ejecución**:
  ```bash
  pnpm exec playwright test
  ```
- **Reportes**: `pnpm exec playwright show-report`

### Integración Continua (CI)
El proyecto utiliza **GitHub Actions** para blindar la calidad del código:
- **`tests.yml`**: Se ejecuta en cada `push` a `main` y en pull requests.
  - Corre Tests Unitarios (Jest)
  - Corre Tests Visuales (Playwright) en entorno macOS (para coincidir con snapshots)
  - Sube artefactos de error automáticamente
- **`deploy.yml`**: Se ejecuta cuando `tests.yml` termina correctamente en `main`.
  - Genera `dist/`
  - Inyecta los secrets de Supabase
  - Despliega en GitHub Pages

---

## 📱 Compatibilidad

- ✅ Chrome / Edge (recomendado)
- ✅ Firefox
- ✅ Safari
- ✅ Dispositivos móviles (responsive)

---

## 🔒 Seguridad y Privacidad

- El progreso en curso y el historial de intentos se almacenan **localmente** en tu navegador (localStorage)
- Opcionalmente, se sincronizan con Supabase para acceso desde múltiples dispositivos
- No se recopila información personal
- Las credenciales de Supabase están **fuera del repositorio** por seguridad

---

## 📄 Licencia

MIT License - Ver archivo LICENSE para detalles

---

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

---

## 📞 Contacto

Para preguntas o sugerencias, abre un issue en el repositorio.

---

## 🗺️ Roadmap

**v2.0** ✅ **COMPLETADO** (2025-12-20)
- ✅ **Migración a Vite**: Bundling moderno y entorno de desarrollo optimizado.
- ✅ **Tailwind CSS v4**: Integración nativa sin dependencias externas duplicadas.
- ✅ **Seguridad**: Variables de entorno `.env`.
- ✅ **Deep Dark Mode**: Nueva estética premium "True Black".
- ✅ **Modularización JS**: Refactorización completa a módulos ES6.

**v2.1** ✅ **COMPLETADO** (2025-12-20)
- ✅ **GitHub Secrets**: Integración de despliegue seguro para repositorios públicos.
- ✅ **Limpieza de Historial**: Purga de credenciales antiguas en el historial de Git.

**v2.2** ✅ **COMPLETADO** (2025-12-20)
- ✅ **Refinamiento UX**: Ajustes de jerarquía visual y tipografía.
- ✅ **Automatización**: Versionado dinámico sin redundancias hardcodeadas.

**v2.3** ✅ **COMPLETADO** (2025-12-23)
- ✅ **Reorganización de Estructura**: Migración de `assets/js/` a `src/` con categorización (core, services, ui, config).
- ✅ **Path Aliases**: Configuración de aliases Vite + Jest para imports limpios (`@core`, `@services`, `@ui`, `@config`).
- ✅ **Consolidación CSS**: Eliminación de archivos duplicados, todos los estilos en `src/`.
- ✅ **Consolidación CSS**: Eliminación de archivos duplicados, todos los estilos en `src/`.
- ✅ **Jest Config**: Configuración de Jest para resolver path aliases.

**v2.4** ✅ **COMPLETADO** (2025-12-24)
- ✅ **Unified Mock System**: Provider pattern para gestión robusta de datos reales vs mock.
- ✅ **Architecture Stability**: Refactor de lógica de Slider (Pure State-Derived).

**v2.5** ✅ **COMPLETADO** (2025-12-25)
- ✅ **Visual Regression Testing**: Suite completa Playwright (14 baselines).
- ✅ **CI/CD Pipeline**: GitHub Actions automatizado con runner macOS.
- ✅ **CSS Optimization**: Eliminación de código redundante y variables no usadas.
- ✅ **Contrast Improvement**: Refinado de jerarquía visual en tarjetas y opciones.

**v2.6** ✅ **COMPLETADO** (2025-12-25)
- ✅ **Performance Optimization**: Implementación de **Batch Fetching**.
- ✅ **UX Improvement**: Eliminación de FOUC y parpadeo de tema (v2.6.1).
- ✅ **Payload Reduction**: Select optimizado de columnas en Supabase.
- ✅ **Smart Resumption**: Posicionamiento automático en la primera pregunta sin contestar (v2.7.0).

**v2.7.2** ✅ **COMPLETADO** (2026-05-27)
- ✅ **Migración a pnpm**: Lockfile reproducible con `pnpm-lock.yaml` y CI/CD actualizado.
- ✅ **Limpieza de estructura**: Eliminación del `public/package.json` obsoleto que duplicaba metadatos.

**v3.0** (Próximamente)
- 📊 Estadísticas avanzadas y gráficos de progreso (Chart.js)
- 📖 Modo de estudio inteligente
- 🏆 Sistema de logros y gamificación

---

## 📚 Documentación Adicional

- [SUPABASE_INTEGRATION.md](./docs/SUPABASE_INTEGRATION.md) - API de servicios
- [SECURITY.md](./docs/SECURITY.md) - Gestión de credenciales

---

**Última actualización**: 2026-05-27
