/**
 * Health endpoint — uptime probes and deploy verification.
 *
 * Public by design: exposes only booleans and the deployed commit, never
 * config values. `db` exercises a real Supabase round-trip; `ok` is false
 * (HTTP 503) when the database is unreachable or core env is missing, so an
 * uptime monitor pointed here catches both.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const envOk = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.RESEND_API_KEY &&
      process.env.ANTHROPIC_API_KEY,
  );

  let dbOk = false;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('cert_requests')
      .select('id', { count: 'exact', head: true })
      .limit(1);
    dbOk = !error;
  } catch {
    dbOk = false;
  }

  const ok = envOk && dbOk;
  return NextResponse.json(
    {
      ok,
      db: dbOk,
      env: envOk,
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 },
  );
}
