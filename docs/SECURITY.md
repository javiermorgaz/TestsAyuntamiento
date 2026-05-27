# Seguridad y Gestión de Credenciales

Este documento describe cómo se gestionan de forma segura las credenciales de Supabase en el proyecto, siguiendo prácticas modernas de desarrollo web.

---

## 🔐 Modelo de Seguridad

### 1. Desarrollo Local (.env)
En local, las credenciales se almacenan en un archivo `.env` en la raíz del proyecto. Este archivo está **excluido de Git** vía `.gitignore` para evitar fugas de datos.

**Variables requeridas:**
```bash
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=tu_clave_anon_aqui
```

### 2. Producción (GitHub Secrets)
Para despliegues públicos (como GitHub Pages), las credenciales se almacenan en los **Secrets de GitHub** e inyectan durante el proceso de build mediante GitHub Actions.

---

## 📁 Archivos Involucrados

### `assets/js/supabase-config.js`
Es el punto central de configuración. Utiliza `import.meta.env` (nativo de Vite) para acceder a las claves. Al ser un módulo ES, las exporta para que otros servicios las importen de forma segura:

```javascript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

export const getSupabaseClient = ...
```

### `.github/workflows/deploy.yml`
El workflow de despliegue inyecta los secretos en el entorno de build solo después de que pasen los tests:

```yaml
env:
  VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
  VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: ${{ secrets.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY }}
```

---

## 🛡️ Mejores Prácticas Implementadas

1.  **Exposición Mínima**: Solo se exponen claves públicas (`anon_key`). Si una clave se viera comprometida, el impacto está limitado por las políticas de **Row Level Security (RLS)** de Supabase.
2.  **No Hardcoding**: Las claves nunca se escriben directamente en el código fuente.
3.  **Historial Limpio**: Se ha realizado una purga total del historial de Git (`git filter-branch`) para eliminar rastros de archivos de configuración antiguos.
4.  **Vite Bundling**: Al usar Vite, las variables de entorno se inyectan en tiempo de compilación, lo que es más eficiente y seguro que realizar peticiones `fetch` adicionales en tiempo de ejecución.

---

## 🚀 Cómo Configurar un Nuevo Entorno

1.  **Clonar el repo**.
2.  **Crear archivo `.env`** en la raíz.
3.  **Copiar tus claves** desde el Dashboard de Supabase (Settings -> API).
4.  **Asegurar RLS**: Verifica que tus tablas en Supabase tengan activado el RLS para que la `anon_key` solo permita las acciones deseadas.

---

## ⚠️ Resolución de Problemas

### Error: "VITE_SUPABASE_URL is not defined"
**Causa**: No se ha creado el archivo `.env` o las variables no tienen el prefijo `VITE_`.
**Solución**: Crea el `.env` y asegúrate de que las variables empiecen por `VITE_`.

### 404 en GitHub Pages (Supabase no conecta)
**Causa**: No se han configurado los Secrets en el repositorio de GitHub.
**Solución**: Ve a tu repositorio en GitHub -> Settings -> Secrets and variables -> Actions -> New repository secret. Añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
