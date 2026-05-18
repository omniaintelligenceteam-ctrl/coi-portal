import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client. Use this in client components for auth flows
 * like `signInWithOtp` and realtime subscriptions.
 *
 * Pattern from https://supabase.com/docs/guides/auth/server-side/nextjs
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
