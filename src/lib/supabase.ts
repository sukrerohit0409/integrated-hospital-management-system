import { createClient } from '@supabase/supabase-js';
import { tabSessionId } from '../data/tabSession';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        // Keep the login session isolated to this browser tab.
        // localStorage would share the same session across every tab.
        persistSession: true,
        storage: window.sessionStorage,
        storageKey: `pulsecare-ihms-auth-${tabSessionId}`,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}
