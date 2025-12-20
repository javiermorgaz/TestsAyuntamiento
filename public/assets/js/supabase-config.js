// assets/js/supabase-config.js

/**
 * Configuración del cliente de Supabase
 * Lee las credenciales desde un archivo de configuración (supabaseAuth.txt)
 * localizado en la carpeta config/ del proyecto
 */

let supabaseClient = null;
let supabaseConfig = null;
let initializationPromise = null;

/**
 * Carga las credenciales desde el archivo de configuración
 * @returns {Promise<Object>} Objeto con SUPABASE_URL y SUPABASE_KEY
 */
async function loadSupabaseCredentials() {
    try {
        // Ruta al archivo de credenciales (dentro del proyecto en config/)
        const AUTH_FILE_URL = './config/supabaseAuth.txt';

        const response = await fetch(AUTH_FILE_URL);

        if (!response.ok) {
            throw new Error(`No se pudo cargar el archivo de credenciales: ${response.status}`);
        }

        const content = await response.text();
        const config = {};

        // Parsear el archivo línea por línea con formato KEY=VALUE
        content.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const match = trimmedLine.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim().replace(/['"]+/g, '');
                    config[key] = value;
                }
            }
        });

        // Obtener URL y clave
        const SUPABASE_URL = config.NEXT_PUBLIC_SUPABASE_URL;
        const SUPABASE_KEY = config.SUPABASE_SERVICE_KEY || config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            throw new Error('El archivo de credenciales debe contener NEXT_PUBLIC_SUPABASE_URL y una clave válida');
        }

        console.log('✅ Credenciales de Supabase cargadas desde archivo externo');
        return { SUPABASE_URL, SUPABASE_KEY };

    } catch (error) {
        console.error('❌ Error al cargar credenciales de Supabase:', error.message);
        console.warn('⚠️ La aplicación funcionará en modo offline (sin sincronización)');
        return null;
    }
}

/**
 * Inicializa el cliente de Supabase
 * @returns {Promise<Object>} Cliente de Supabase
 */
async function initSupabase() {
    if (supabaseClient) return supabaseClient;

    // Si ya hay una inicialización en curso, devolver esa promesa
    if (initializationPromise) return initializationPromise;

    // Crear nueva promesa de inicialización
    initializationPromise = (async () => {
        try {
            if (typeof supabase === 'undefined') {
                console.error('⚠️ El SDK de Supabase no está cargado. Asegúrate de incluir el script CDN en el HTML.');
                return null;
            }

            // Cargar credenciales si no están cargadas
            if (!supabaseConfig) {
                supabaseConfig = await loadSupabaseCredentials();
            }

            if (!supabaseConfig) {
                console.warn('⚠️ No se pudo inicializar Supabase. Modo offline activado.');
                return null;
            }

            // Configuración del cliente
            const options = {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            };

            supabaseClient = supabase.createClient(supabaseConfig.SUPABASE_URL, supabaseConfig.SUPABASE_KEY, options);
            console.log('✅ Cliente de Supabase inicializado correctamente (Singleton)');
            return supabaseClient;
        } catch (error) {
            console.error('Error durante la inicialización de Supabase:', error);
            return null;
        } finally {
            initializationPromise = null; // Limpiar promesa al terminar
        }
    })();

    return initializationPromise;
}

/**
 * Obtiene el cliente de Supabase (lo inicializa si es necesario)
 * @returns {Promise<Object>} Cliente de Supabase
 */
async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;
    return await initSupabase();
}
