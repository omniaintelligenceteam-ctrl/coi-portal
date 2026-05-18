import { createClient } from '@supabase/supabase-js';

/**
 * Service-role Supabase client. Bypasses RLS. Use for server-side writes
 * (cert_requests insert, storage uploads, client_overrides) where the user
 * is authenticated but the row mutation is performed on their behalf.
 *
 * NEVER import this from a client component or expose the key to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
