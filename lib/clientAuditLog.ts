/**
 * Helpers for writing to client_audit_log.
 *
 * The audit log is append-only and lives next to (not inside) coi_clients so
 * the dominant "load current client" read path stays cheap. See migration
 * 20260520_0003_client_profile_expansion.sql for table shape.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger';

export type ClientAuditAction = 'updated' | 'archived' | 'restored' | 'transferred';

export type FieldDiff<T = string | boolean | null> = {
  from: T;
  to: T;
};

export type ClientDiff = Record<string, FieldDiff>;

/**
 * Compute a per-field diff. Skips fields that are identical (so the audit log
 * never records noise like "saved with no changes").
 *
 * Use this on the server side, with the before-row pulled from the DB and the
 * after-row constructed from the request body.
 */
export function diffClient(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ClientDiff {
  const diff: ClientDiff = {};
  for (const key of Object.keys(after)) {
    const a = normalize(before[key]);
    const b = normalize(after[key]);
    if (a !== b) {
      diff[key] = { from: a, to: b };
    }
  }
  return diff;
}

function normalize(v: unknown): string | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v;
  // Treat empty string as null so saving an empty field over a null one isn't
  // recorded as a change.
  if (typeof v === 'string') {
    const trimmed = v.trim();
    return trimmed === '' ? null : trimmed;
  }
  return String(v);
}

/**
 * Write a client_audit_log row. Fails silently (logs to stdout) — audit failure
 * must never block the user-visible update. If the audit row can't be written
 * we still want the profile change to land; we just record the warn so it can
 * be reconciled later.
 */
export async function writeClientAudit(
  admin: SupabaseClient,
  params: {
    clientId: string;
    action: ClientAuditAction;
    actorEmail: string;
    actorIp?: string | null;
    diff?: ClientDiff;
    note?: string | null;
  },
): Promise<void> {
  const { clientId, action, actorEmail, actorIp, diff, note } = params;

  // Don't record no-op updates — saving a form with zero changes shouldn't
  // pollute the timeline. Other actions (archive, restore, transfer) always log.
  if (action === 'updated' && diff && Object.keys(diff).length === 0) {
    return;
  }

  const { error } = await admin.from('client_audit_log').insert({
    client_id: clientId,
    action,
    actor_email: actorEmail,
    actor_ip: actorIp ?? null,
    diff: diff ?? {},
    note: note ?? null,
  });

  if (error) {
    log.warn('client_audit.write_failed', {
      clientId,
      action,
      actorEmail,
      error: error.message,
    });
  }
}
