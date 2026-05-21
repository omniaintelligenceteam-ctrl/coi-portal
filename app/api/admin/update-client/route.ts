/**
 * Admin endpoint — edit a client's insured profile.
 *
 * Phase 1 of the world-class plan: all editable fields land here, every
 * change is validated with zod and recorded in client_audit_log with a
 * per-field diff. The audit row is best-effort — if it fails the profile
 * update still lands and a warn line is emitted for reconciliation.
 *
 * Fields editable through this route:
 *   - business_name (1-200 chars, required if present)
 *   - business_address1 / business_address2 (max 200 chars, nullable)
 *   - contact_name (max 200 chars, nullable)
 *   - contact_email (RFC 5322-ish, max 320 chars, required if present)
 *   - phone (max 50 chars, nullable)
 *   - agency_id (uuid — agency transfer)
 *   - active (bool — admin soft-delete; archive goes through archive-client)
 *
 * Archive/restore is a separate route because it has different semantics
 * (different action label in the audit log, different downstream effects).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { diffClient, writeClientAudit } from '@/lib/clientAuditLog';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// Helpers that coerce empty strings to null so a cleared field reads as null
// in the DB instead of an empty string. Matches the normalize() in
// lib/clientAuditLog so diff comparison and DB write agree.
const nullableString = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null) return null;
      const trimmed = v.trim();
      return trimmed === '' ? null : trimmed;
    });

const requiredString = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.trim()));

const BodySchema = z.object({
  clientId: z.string().uuid(),
  businessName: requiredString(1, 200),
  businessAddress1: nullableString(200),
  businessAddress2: nullableString(200),
  contactName: nullableString(200),
  contactEmail: z
    .string()
    .email()
    .max(320)
    .optional()
    .transform((v) => (v === undefined ? undefined : v.trim().toLowerCase())),
  phone: nullableString(50),
  agencyId: z.string().uuid().optional(),
  active: z.boolean().optional(),
  // Master File defaults (added 20260521)
  defaultDescription: nullableString(2000),
  // Per-client trust ladder thresholds (added 20260521_0001)
  autoApproveThresholdLow: z.number().int().min(0).max(100).optional(),
  autoApproveThresholdHigh: z.number().int().min(0).max(100).optional(),
});

type UpdatePayload = z.infer<typeof BodySchema>;

// Map camelCase keys from the request to snake_case columns in the DB.
const FIELD_MAP: Record<keyof Omit<UpdatePayload, 'clientId'>, string> = {
  businessName: 'business_name',
  businessAddress1: 'business_address1',
  businessAddress2: 'business_address2',
  contactName: 'contact_name',
  contactEmail: 'contact_email',
  phone: 'phone',
  agencyId: 'agency_id',
  active: 'active',
  defaultDescription: 'default_description',
  autoApproveThresholdLow: 'auto_approve_threshold_low',
  autoApproveThresholdHigh: 'auto_approve_threshold_high',
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: UpdatePayload;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // Build the column-level update map. Skips clientId, skips undefined fields.
  const update: Record<string, string | boolean | number | null> = {};
  for (const [reqKey, dbCol] of Object.entries(FIELD_MAP) as Array<
    [keyof typeof FIELD_MAP, string]
  >) {
    const value = body[reqKey];
    if (value !== undefined) {
      update[dbCol] = value;
    }
  }

  // Threshold sanity — guard against threshold_low > threshold_high crossing
  // the DB CHECK constraint (the API will return a less useful error otherwise).
  if (
    update.auto_approve_threshold_low !== undefined &&
    update.auto_approve_threshold_high !== undefined &&
    typeof update.auto_approve_threshold_low === 'number' &&
    typeof update.auto_approve_threshold_high === 'number' &&
    update.auto_approve_threshold_low > update.auto_approve_threshold_high
  ) {
    return NextResponse.json(
      {
        error: 'invalid thresholds',
        detail: 'Low threshold must be <= high threshold.',
      },
      { status: 400 },
    );
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Pull the current row so we can compute a real diff. The set of columns
  // here mirrors FIELD_MAP — load only what we might compare.
  const beforeSelect = Object.values(FIELD_MAP).join(', ');
  const { data: before, error: readErr } = await admin
    .from('coi_clients')
    .select(`id, ${beforeSelect}`)
    .eq('id', body.clientId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: 'db error', detail: readErr.message }, { status: 500 });
  }
  if (!before) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  // Apply the update.
  const { data: after, error: writeErr } = await admin
    .from('coi_clients')
    .update(update)
    .eq('id', body.clientId)
    .select(
      `id, agency_id, business_name, business_address1, business_address2,
       contact_name, contact_email, phone, active, auto_approve_enabled,
       archived_at`,
    )
    .maybeSingle();

  if (writeErr) {
    return NextResponse.json({ error: 'db error', detail: writeErr.message }, { status: 500 });
  }
  if (!after) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  // Compute diff against the same shape we just wrote so before/after column
  // names line up.
  const beforeShape: Record<string, unknown> = {};
  const afterShape: Record<string, unknown> = {};
  for (const dbCol of Object.keys(update)) {
    beforeShape[dbCol] = (before as unknown as Record<string, unknown>)[dbCol];
    afterShape[dbCol] = update[dbCol];
  }
  const diff = diffClient(beforeShape, afterShape);

  // Agency change is its own audit action — keeps the timeline readable.
  const isTransfer = 'agency_id' in update;
  await writeClientAudit(admin, {
    clientId: body.clientId,
    action: isTransfer && Object.keys(diff).length === 1 ? 'transferred' : 'updated',
    actorEmail: email,
    actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    diff,
  });

  log.info('client.updated', {
    clientId: body.clientId,
    by: email,
    fields: Object.keys(diff),
  });

  return NextResponse.json({ ok: true, client: after });
}
