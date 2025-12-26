import { createClient } from '@supabase/supabase-js';

// These are typically globally available in your supabase-config.js
// but since we are migrating to modules, we'll need to handle them properly.
// For now, we assume they are still on the window object or we can import them.
const supabaseUrl = window.SUPABASE_URL;
const supabaseKey = window.SUPABASE_PUBLISHABLE_DEFAULT_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials not found on window object.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
