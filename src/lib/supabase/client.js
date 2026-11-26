// Authoritative Supabase Client Configuration for Chess-ey
// Implements silent, persistent anonymous authentication using localStorage,
// automatic session refreshing, and backend connectivity diagnostics.

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

// Use persistent localStorage for anonymous authentication (Rebuild Blueprint 5.1)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        storageKey: 'chessey_supabase_auth_token',
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
 * Ensures an anonymous authenticated user session exists silently without user friction.
 * Preserves the session across page reloads and browser restarts using localStorage.
 */
export async function ensureAnonymousAuth() {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  try {
    // 1. Check existing active session
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (!sessionError && session?.user) {
      return session.user;
    }

    // 2. Sign in anonymously if no valid session is present
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      if (error.message && error.message.includes('Anonymous sign-ins are disabled')) {
        throw new Error(
          'Anonymous sign-ins are disabled in Supabase. In your Supabase Dashboard: Go to Authentication -> Providers -> Anonymous and toggle Enable Anonymous Sign-ins ON.'
        );
      }
      throw error;
    }

    return data.user;
  } catch (err) {
    console.warn('[Supabase Auth] Anonymous auth initialization warning:', err.message);
    throw err;
  }
}

/**
 * Retrieves the current authenticated user ID if one exists.
 */
export async function getCurrentUserId() {
  if (!supabase) return null;
  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.user?.id || null;
  } catch {
    return null;
  }
}

/**
 * Diagnostic health check verifying Supabase connection, Auth, table access, and RPC readiness.
 */
export async function checkBackendHealth() {
  if (!supabase) {
    return {
      configured: false,
      ready: false,
      authOk: false,
      tableOk: false,
      rpcOk: false,
      message: 'Supabase URL or Anon Key is missing from environment.'
    };
  }

  let authOk = false;
  let authMsg = '';
  try {
    const user = await ensureAnonymousAuth();
    if (user) authOk = true;
  } catch (e) {
    authMsg = e.message;
  }

  let tableOk = false;
  let tableMsg = '';
  try {
    const { error } = await supabase.from('rooms').select('id').limit(1);
    if (!error) {
      tableOk = true;
    } else {
      tableMsg = error.message;
    }
  } catch (e) {
    tableMsg = e.message;
  }

  let rpcOk = false;
  let rpcMsg = '';
  try {
    const { error } = await supabase.rpc('create_chess_room', {
      p_token_hash: '0000000000000000000000000000000000000000000000000000000000000000'
    });
    // If function exists (even if it returns a validation error), RPC is present
    if (!error || !error.message?.includes('does not exist')) {
      rpcOk = true;
    } else {
      rpcMsg = error.message;
    }
  } catch (e) {
    rpcMsg = e.message;
  }

  const isReady = authOk && tableOk;

  return {
    configured: true,
    ready: isReady,
    authOk,
    tableOk,
    rpcOk,
    authMsg,
    tableMsg,
    rpcMsg
  };
}

export default supabase;
