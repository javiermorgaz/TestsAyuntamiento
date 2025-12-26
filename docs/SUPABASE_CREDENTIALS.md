# 🔑 Guía: Obtener Credenciales de Supabase para Desarrollo Local

Esta guía te ayudará a obtener las credenciales necesarias para ejecutar el script `build-index.js` localmente.

## 📋 Credenciales Necesarias

Para el desarrollo local necesitas **3 valores**:

1. **`VITE_SUPABASE_URL`** - URL de tu proyecto Supabase
2. **`VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`** - Clave pública/anónima (safe para frontend)
3. **`SUPABASE_SERVICE_KEY`** - Clave de servicio (⚠️ privada, solo backend)

---

## 🚀 Pasos para Obtener las Credenciales

### 1. Accede a tu Proyecto en Supabase

1. Ve a [https://supabase.com](https://supabase.com)
2. Inicia sesión con tu cuenta
3. Selecciona tu proyecto (el que usas para esta app)

### 2. Obtén la URL del Proyecto

1. En el panel lateral, haz clic en **⚙️ Settings** (Configuración)
2. Selecciona **API**
3. En la sección **Project URL**, copia la URL que aparece
   - Ejemplo: `https://abcdefghijklmnop.supabase.co`
4. Esta es tu **`VITE_SUPABASE_URL`**

### 3. Obtén la Clave Anónima (anon key)

1. En la misma página **Settings > API**
2. En la sección **Project API keys**, busca **`anon` `public`**
3. Copia el valor que aparece
   - Es una cadena larga que empieza con `eyJ...`
4. Esta es tu **`VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`**

### 4. Obtén la Clave de Servicio (service_role key)

⚠️ **IMPORTANTE**: Esta clave tiene permisos completos. **NUNCA** la expongas en el frontend.

1. En la misma página **Settings > API**
2. En la sección **Project API keys**, busca **`service_role` `secret`**
3. Haz clic en **Reveal** para mostrar la clave
4. Copia el valor completo
   - También es una cadena larga que empieza con `eyJ...`
5. Esta es tu **`SUPABASE_SERVICE_KEY`**

---

## 📝 Crear el Archivo `.env`

Una vez que tengas las 3 credenciales:

1. En la raíz del proyecto, copia el archivo de ejemplo:
   ```bash
   cp .env.example .env
   ```

2. Abre el archivo `.env` con tu editor favorito:
   ```bash
   code .env  # Si usas VS Code
   # o
   nano .env  # Editor de terminal
   ```

3. Pega tus credenciales reales:
   ```env
   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

4. Guarda el archivo

---

## ✅ Verificar que Funciona

Ejecuta el script de generación de índices:

```bash
npm run build-index
```

Si todo está correcto, deberías ver:

```
🔎 Buscando credenciales en variables de entorno (.env)...
✅ Credenciales cargadas exitosamente desde .env
🔍 Escaneando tests en /data/tests/...
✅ Encontrados 17 archivos de test:
...
🔄 Sincronizando con Supabase...
✅ Sincronizados 17 tests en Supabase.
✅ Índice generado correctamente
```

---

## 🔒 Seguridad

- ✅ El archivo `.env` está en `.gitignore` - **nunca se subirá a GitHub**
- ✅ La `SUPABASE_SERVICE_KEY` solo se usa en scripts de Node.js locales
- ✅ El frontend solo usa `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (segura para exponer)
- ✅ En producción (GitHub Actions), las credenciales vienen de **GitHub Secrets**

---

## 🆘 Solución de Problemas

### Error: "Faltan variables de entorno"

- Verifica que el archivo `.env` existe en la raíz del proyecto
- Asegúrate de que las variables tienen los nombres exactos (con `VITE_` al inicio)
- No dejes espacios alrededor del `=`

### Error al sincronizar con Supabase

- Verifica que la `SUPABASE_SERVICE_KEY` sea correcta (no la `anon key`)
- Comprueba que tu proyecto Supabase esté activo
- Revisa que tengas permisos de escritura en la tabla `tests`

### El script funciona pero no sincroniza

- Si solo ves el índice generado pero no el mensaje de sincronización, es normal
- El script funciona sin Supabase, solo no actualiza la base de datos remota
- Verifica que hayas copiado la `service_role` key, no la `anon` key
