/**
 * Chat thread persistence endpoints.
 *
 * GET  /api/chat/thread  — load the authenticated insured's existing thread
 *                          messages so the ChatWidget can hydrate on mount.
 * DELETE /api/chat/thread — clear the thread (the "start over" button on the
 *                           widget).
 *
 * The write side (appending messages after a turn) lives in /api/chat itself
 * so the server has authoritative control over what's persisted.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ messages: [] }, { status: 401 });

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', user.email.toLowerCase())
    .maybeSingle();

  if (!client) return NextResponse.json({ messages: [] });

  const { data: thread } = await admin
    .from('chat_threads')
    .select('messages, last_message_at')
    .eq('client_id', client.id)
    .maybeSingle();

  return NextResponse.json({
    messages: thread?.messages ?? [],
    lastMessageAt: thread?.last_message_at ?? null,
  });
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', user.email.toLowerCase())
    .maybeSingle();
  if (!client) return NextResponse.json({ ok: false }, { status: 403 });

  // Soft-clear: keep the row, blank the messages array. Mirrors the existing
  // soft-archive pattern elsewhere (no rows ever hard-delete).
  const { error } = await admin
    .from('chat_threads')
    .update({ messages: [], last_message_at: new Date().toISOString() })
    .eq('client_id', client.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
