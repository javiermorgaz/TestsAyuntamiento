// assets/js/supabase-config.js
import { createClient } from '@supabase/supabase-js';

/**
 * Configuración del cliente de Supabase
 * Utiliza variables de entorno de Vite (inyectadas durante el build)
 */

let supabaseClient = null;
let initializationPromise = null;

/**
 * Inicializa el cliente de Supabase usando variables de entorno
 * @returns {Promise<Object>} Cliente de Supabase
 */
async function initSupabase() {
    if (supabaseClient) return supabaseClient;

    // Si ya hay una inicialización en curso, devolver esa promesa
    if (initializationPromise) return initializationPromise;

    // Crear nueva promesa de inicialización
    initializationPromise = (async () => {
        try {
            // Obtener credenciales desde las variables de entorno de Vite
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

            if (!SUPABASE_URL || !SUPABASE_KEY) {
                console.warn('⚠️ No se han configurado las variables de entorno de Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Modo offline activado.');
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

            supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, options);
            console.log('✅ Cliente de Supabase inicializado correctamente via Vite ENV (Singleton)');
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

// Hacer disponible globalmente
window.getSupabaseClient = getSupabaseClient;
