/**
 * Holder CRM — first-class holder entities (holders table, migration
 * 20260713_0004).
 *
 * A holder record is keyed per client by normalized (name, address1). The
 * cert PDF always renders from the strings on the cert_requests row; the
 * holder entity carries contact info, notes, and coverage requirements.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger';

/** Escape LIKE wildcards so "100% Roofing" matches literally in ilike. */
function likeLiteral(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type HolderEntity = {
  id: string;
  client_id: string;
  name: string;
  address1: string;
  address2: string | null;
  contact_email: string | null;
  phone: string | null;
  notes: string | null;
  requirements: unknown;
};

/**
 * Find or create the holder entity for a (client, name, address1) pair.
 * Fills in contact_email/address2 on the existing record when we learn them
 * (never overwrites a non-null value). Returns null on failure — holder
 * linkage is enrichment, never a reason to fail an issuance.
 */
export async function findOrCreateHolder(
  admin: SupabaseClient,
  args: {
    clientId: string;
    name: string;
    address1: string;
    address2?: string | null;
    contactEmail?: string | null;
  },
): Promise<string | null> {
  try {
    const { data: existing, error: readErr } = await admin
      .from('holders')
      .select('id, address2, contact_email')
      .eq('client_id', args.clientId)
      .ilike('name', likeLiteral(args.name))
      .ilike('address1', likeLiteral(args.address1))
      .limit(1)
      .maybeSingle<{ id: string; address2: string | null; contact_email: string | null }>();
    if (readErr) throw new Error(readErr.message);

    if (existing) {
      const patch: Record<string, unknown> = {};
      if (!existing.contact_email && args.contactEmail) patch.contact_email = args.contactEmail;
      if (!existing.address2 && args.address2) patch.address2 = args.address2;
      if (Object.keys(patch).length > 0) {
        await admin.from('holders').update(patch).eq('id', existing.id);
      }
      return existing.id;
    }

    const { data: created, error: insErr } = await admin
      .from('holders')
      .insert({
        client_id: args.clientId,
        name: args.name,
        address1: args.address1,
        address2: args.address2 || null,
        contact_email: args.contactEmail || null,
      })
      .select('id')
      .single<{ id: string }>();
    if (insErr || !created) {
      // Unique-index race with a concurrent issuance: re-read.
      const { data: raced } = await admin
        .from('holders')
        .select('id')
        .eq('client_id', args.clientId)
        .ilike('name', likeLiteral(args.name))
        .ilike('address1', likeLiteral(args.address1))
        .limit(1)
        .maybeSingle<{ id: string }>();
      return raced?.id ?? null;
    }
    return created.id;
  } catch (err) {
    log.warn('holders.find_or_create_failed', {
      clientId: args.clientId,
      holderName: args.name,
      error: (err as Error).message,
    });
    return null;
  }
}
