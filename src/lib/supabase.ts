import { supabase } from '@/services/supabaseService';

export const isSupabaseConfigured = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Maintain existing exports/functionality if needed, but redirecting to service
export { supabase };

