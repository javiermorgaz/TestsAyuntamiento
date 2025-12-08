# Seguridad y Gestión de Credenciales

## Ubicación del Archivo de Credenciales

Las credenciales de Supabase se almacenan en un archivo **fuera del directorio del proyecto** para evitar que se suban accidentalmente al repositorio.

### Ubicación Recomendada
```
../supabaseAuth.txt
```
(Un nivel arriba del directorio del proyecto)

### Estructura del Proyecto
```
/ruta/a/tus/proyectos/
├── supabaseAuth.txt          ← Archivo de credenciales (FUERA del proyecto)
└── TestsAyuntamiento/        ← Directorio del proyecto
    ├── assets/
    │   └── js/
    │       ├── supabase-config.js    (carga credenciales desde ../../supabaseAuth.txt)
    │       └── supabase-service.js
    ├── scripts/
    │   └── build-index.js            (carga credenciales desde ../../supabaseAuth.txt)
    ├── .gitignore                    (ignora supabaseAuth.txt)
    └── ...
```

## Formato del Archivo de Credenciales

El archivo `supabaseAuth.txt` debe contener las siguientes variables en formato `KEY=VALUE`:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_clave_publicable
```

O, si tienes la clave de servicio:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_KEY=tu_clave_de_servicio
```

### Notas sobre las Claves

- **NEXT_PUBLIC_SUPABASE_URL**: URL de tu proyecto de Supabase
- **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY**: Clave pública (anon key) - segura para el frontend
- **SUPABASE_SERVICE_KEY**: Clave privada de servicio - solo para scripts backend (como build-index.js)

## Archivos que Usan las Credenciales

### 1. Script de Generación de Índices (Node.js)
**Archivo**: `scripts/build-index.js`

```javascript
const AUTH_FILE_PATH = path.join(__dirname, '..', '..', 'supabaseAuth.txt');
```

Este script lee el archivo usando `fs.readFileSync` (Node.js).

### 2. Configuración de Supabase (Browser)
**Archivo**: `assets/js/supabase-config.js`

```javascript
const AUTH_FILE_URL = '../../supabaseAuth.txt';
const response = await fetch(AUTH_FILE_URL);
```

Este archivo lee el archivo usando `fetch` (navegador).

## Seguridad

### ✅ Prácticas Seguras Implementadas

1. **Archivo externo**: Las credenciales NO están en el código fuente
2. **`.gitignore`**: El archivo está excluido del control de versiones
3. **Modo offline**: Si no se encuentran credenciales, la app funciona localmente
4. **Dos entornos**: Script backend usa service key, frontend usa publishable key

### ⚠️ Consideraciones Importantes

1. **No subir al repositorio**: Asegúrate de que `supabaseAuth.txt` NUNCA se suba a GitHub
2. **Backups**: Haz backup del archivo de credenciales en un lugar seguro
3. **Compartir**: Si compartes el proyecto, NO incluyas el archivo de credenciales
4. **Servidor local**: Para desarrollo, usa un servidor local (Live Server) en lugar de abrir `index.html` directamente

## Regenerar Credenciales

Si necesitas regenerar las credenciales:

1. Ve a tu proyecto en [Supabase Dashboard](https://app.supabase.com)
2. Settings → API
3. Copia las nuevas claves
4. Actualiza el archivo `supabaseAuth.txt`

## Despliegue en Producción

Para desplegar en producción (por ejemplo, en Netlify, Vercel, etc.):

### Opción 1: Variables de Entorno (Recomendado)

Modifica `supabase-config.js` para usar variables de entorno:

```javascript
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
```

Configura las variables en tu plataforma de hosting.

### Opción 2: Build-time Injection

Durante el build, reemplaza las credenciales usando herramientas como `dotenv` o configuración específica de la plataforma.

## Troubleshooting

### Error: "No se pudo cargar el archivo de credenciales"

**Causa**: El archivo no existe o la ruta es incorrecta

**Solución**:
1. Verifica que el archivo existe en la ruta correcta (un nivel arriba del proyecto)
2. Verifica los permisos del archivo
3. Si estás usando un servidor local, asegúrate de que puede acceder a archivos fuera del directorio raíz

### Error de CORS al cargar credenciales

**Causa**: Restricciones de CORS del navegador al usar `file://`

**Solución**:
1. Usa un servidor local como Live Server (VS Code)
2. O usa `python -m http.server 8000` en el directorio del proyecto
3. Accede a `http://localhost:8000` en lugar de `file://`

### La app funciona pero no sincroniza con Supabase

**Causa**: Las credenciales no se cargaron correctamente

**Solución**:
1. Abre la consola del navegador (F12)
2. Busca mensajes de error relacionados con Supabase
3. Verifica que el archivo `supabaseAuth.txt` tiene el formato correcto
4. Verifica que las credenciales son válidas en Supabase Dashboard
