# 📚 App de Tests de Oposiciones

Aplicación web para realizar tests de preparación para oposiciones de ayuntamientos.

---

## 🎯 Características

### Funcionalidades Actuales
- ✅ **17 temas** de oposiciones (482 preguntas totales)
- ✅ **Tests interactivos** con preguntas de opción múltiple
- ✅ **Corrección automática** con detalle de aciertos y errores
- ✅ **Historial de intentos** guardado localmente y en la nube
- ✅ **Modo híbrido** - online (Supabase) + offline (localStorage)
- ✅ **Sincronización en la nube** con Supabase
- ✅ **Auto-guardado** de progreso durante el test (cada 30s + al cambiar respuesta)
- ✅ **Continuación de tests** - retomar donde lo dejaste desde cualquier dispositivo
- ✅ **Sincronización entre dispositivos** vía Supabase

### Futuras Mejoras
- 📊 Estadísticas avanzadas por tema
- 📖 Modo de estudio (solo preguntas falladas)
- ⏱️ Cronómetro y límite de tiempo

---

## 📦 Contenido

### Temas Disponibles

#### Bloque Constitucional
1. **Tema 1**: La Constitución Española (I) - Derechos y Deberes Fundamentales (42 preguntas)
2. **Tema 2**: La Constitución Española (II) - Corona, Cortes, Gobierno y Poder Judicial (38 preguntas)
3. **Tema 3**: La Constitución Española (III) - Organización Territorial (24 preguntas)
4. **Tema 4**: Estatuto de Autonomía para Andalucía (26 preguntas)
5. **Tema 5**: La Unión Europea (14 preguntas)

#### Administración Local
6. **Tema 6**: Ley de Bases del Régimen Local (LBRL) (41 preguntas)
7. **Tema 13**: Organización del Ayuntamiento de Sevilla (12 preguntas)

#### Procedimiento Administrativo
7. **Tema 7**: Ley 39/2015 (I) - Interesados, Registros, Plazos (36 preguntas)
8. **Tema 8**: Ley 39/2015 (II) - Actos Administrativos (39 preguntas)
9. **Tema 9**: Ley 39/2015 (III) - Recursos Administrativos (31 preguntas)

#### Régimen Jurídico
10. **Tema 10**: Ley Orgánica 3/2018 (LOPD-GDD) (18 preguntas)
11. **Tema 11**: Ley 40/2015 (LRJSP) (24 preguntas)
12. **Tema 12**: Ley 19/2013 de Transparencia (28 preguntas)

#### Personal y Presupuestos
14. **Tema 14**: Personal de Entidades Locales (I) (32 preguntas)
15. **Tema 15**: Personal de Entidades Locales (II) (35 preguntas)
16. **Tema 16**: Igualdad y Violencia de Género (17 preguntas)
17. **Tema 17**: Presupuesto Municipal (25 preguntas)

**Total**: 482 preguntas distribuidas en 17 temas

---

## 🚀 Uso

### Abrir la Aplicación

#### Opción 1: Abrir directamente
```bash
# Navega al directorio del proyecto
cd TestsAyuntamiento

# Abre index.html en tu navegador
open index.html  # macOS
# o
start index.html  # Windows
# o
xdg-open index.html  # Linux
```

#### Opción 2: Servidor local (recomendado)
```bash
# Con Python 3
python -m http.server 8000

# O con Node.js (si tienes http-server instalado)
npx http-server

# O con Live Server en VS Code
# Clic derecho en index.html → "Open with Live Server"
```

Luego abre en el navegador: `http://localhost:8000`

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

---

## 🗄️ Estructura del Proyecto

```
TestsAyuntamiento/
├── index.html                      # Página principal
├── config/
│   └── supabaseAuth.txt            # Credenciales de Supabase (claves públicas)
├── assets/
│   ├── css/
│   │   └── style.css               # Estilos
│   └── js/
│       ├── main.js                 # Lógica principal
│       ├── test.js                 # Lógica de tests
│       ├── storage.js              # Gestión de localStorage
│       ├── supabase-config.js      # Configuración de Supabase
│       ├── supabase-service.js     # Servicios de Supabase
│       └── dataService.js          # Capa de abstracción
├── data/
│   ├── tests_index.json            # Índice de tests
│   └── tests/
│       ├── tema1.json              # Preguntas del tema 1
│       ├── tema2.json              # Preguntas del tema 2
│       └── ... (tema3 - tema17)
├── scripts/
│   └── build-index.js              # Script de sincronización
├── package.json                    # Dependencias
├── README.md                       # Este archivo
└── docs/
    ├── SUPABASE_INTEGRATION.md     # Documentación técnica
    └── SECURITY.md                 # Gestión de credenciales
```

---

## 🔧 Para Desarrolladores

### Requisitos
- Node.js (para script de sincronización)
- Cuenta de Supabase (opcional, para sincronización en la nube)

### Instalación

```bash
# Clonar el repositorio
git clone <url-del-repo>
cd TestsAyuntamiento

# Instalar dependencias
npm install
```

### Script de Sincronización

El script `build-index.js` genera automáticamente el índice de tests y sincroniza con Supabase:

```bash
npm run build-index
```

**Qué hace**:
1. Lee todos los archivos JSON de `data/tests/`
2. Genera `data/tests_index.json` con metadatos
3. Sincroniza con la tabla `tests` de Supabase (si está configurado)

### Agregar Nuevos Tests

1. **Crear archivo JSON** en `data/tests/` con el formato:

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
npm run build-index
```

3. **Verificar** que el nuevo test aparece en la lista

---

## 🗄️ Base de Datos (Supabase)

### Configuración

Las credenciales de Supabase se almacenan en un archivo de configuración **dentro del proyecto**:

```
config/supabaseAuth.txt
```

Este archivo contiene las claves públicas de Supabase, por lo que es seguro incluirlo en el repositorio.

Formato del archivo:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_clave_aqui
```

Ver [SECURITY.md](./docs/SECURITY.md) para más detalles.

### Tablas

#### `tests` - Catálogo de tests
```sql
id              INT PRIMARY KEY
titulo          TEXT
fichero         TEXT
num_preguntas   INT
```

#### `results` - Progreso y resultados
```sql
id                  BIGINT PRIMARY KEY
test_id             INT (FK → tests.id)
status              ENUM ('in_progress', 'completed')
score_percentage    NUMERIC
total_correct       INT
total_questions     INT
answers_data        JSONB
```

Ver [SUPABASE_INTEGRATION.md](./SUPABASE_INTEGRATION.md) para la API completa.

---

## 📱 Compatibilidad

- ✅ Chrome / Edge (recomendado)
- ✅ Firefox
- ✅ Safari
- ✅ Dispositivos móviles (responsive)

---

## 🔒 Seguridad y Privacidad

- Los datos de tests se almacenan **localmente** en tu navegador (localStorage)
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

### Próximas Versiones

**v1.1** ✅ **COMPLETADO** (2025-12-08)
- ✅ Auto-guardado de progreso (cada 30s + debounce 2s)
- ✅ Continuación de tests desde cualquier dispositivo
- ✅ Sincronización entre dispositivos vía Supabase
- ✅ Modo híbrido online/offline

**v1.2** (Planificado)
- Estadísticas por tema
- Modo de estudio
- Gráficos de progreso

**v2.0** (Futuro)
- Sistema de usuarios
- Tests personalizados
- Modo examen con tiempo límite
- Exportar resultados

---

## 📚 Documentación Adicional

- [SUPABASE_INTEGRATION.md](./docs/SUPABASE_INTEGRATION.md) - API de servicios
- [SECURITY.md](./docs/SECURITY.md) - Gestión de credenciales

---

**Última actualización**: 2025-12-08
