import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 20
);

export const supabaseProjectRef = (() => {
  try {
    const url = new URL(supabaseUrl);
    return url.hostname.split('.')[0] || '';
  } catch {
    return '';
  }
})();

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    })
  : null;

/**
 * Ensures an anonymous authenticated user session exists silently without user friction
 */
export async function ensureAnonymousAuth() {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return session.user;
    }

    // Sign in anonymously
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      if (error.message.includes('Anonymous sign-ins are disabled')) {
        throw new Error('Anonymous sign-ins are disabled in Supabase. In your Supabase Dashboard: Go to Authentication -> Providers -> Anonymous and toggle Enable Anonymous Sign-ins ON.');
      }
      throw error;
    }
    return data.user;
  } catch (err) {
    console.warn('Anonymous auth initialization:', err.message);
    throw err;
  }
}

/**
 * Diagnostic check for multiplayer readiness
 */
export async function checkBackendHealth() {
  if (!supabase) {
    return { configured: false, ready: false, authOk: false, tableOk: false, rpcOk: false };
  }

  let authOk = false;
  let authMsg = '';
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      authOk = true;
    } else {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        authMsg = error.message;
      } else if (data?.user) {
        authOk = true;
      }
    }
  } catch (e) {
    authMsg = e.message;
  }

  let tableOk = false;
  let tableMsg = '';
  try {
    const { error } = await supabase.from('rooms').select('id').limit(1);
    if (error) {
      tableMsg = error.message;
    } else {
      tableOk = true;
    }
  } catch (e) {
    tableMsg = e.message;
  }

  let rpcOk = false;
  let rpcMsg = '';
  try {
    // Probe the RPC function without creating a room
    const { error } = await supabase.rpc('create_chess_room', {
      p_token_hash: ''
    });
    // If the function exists in PostgREST schema cache, it will either return a result
    // (with success: false) or a validation error, NOT PGRST202 or 'schema cache' error
    if (!error || (!error.message?.includes('schema cache') && error.code !== 'PGRST202')) {
      rpcOk = true;
    } else {
      rpcMsg = error.message;
    }
  } catch (e) {
    rpcMsg = e.message;
  }

  return {
    configured: true,
    ready: authOk && tableOk && rpcOk,
    authOk,
    authMsg,
    tableOk,
    tableMsg,
    rpcOk,
    rpcMsg
  };
}
