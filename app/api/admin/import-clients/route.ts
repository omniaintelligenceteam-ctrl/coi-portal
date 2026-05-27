/**
 * Admin endpoint — bulk import clients from a parsed CSV/spreadsheet.
 *
 * Designed for the broker handoff flow: Brook hands over a roster of 20+
 * clients with their contact + address + which forms they're enabled for.
 * The UI at /admin/import-clients does the CSV parsing in-browser via
 * papaparse and POSTs the parsed rows here; this route validates per-row,
 * upserts on (agency_id, contact_email), and writes one audit log row per
 * client created or updated.
 *
 * Two modes:
 *   - dryRun: true   — validate every row, no DB writes, returns per-row
 *                      outcomes so the UI can show a preview before commit
 *   - dryRun: false  — same validation + upsert + audit
 *
 * Upsert semantics:
 *   - New row (no existing client with that email under this agency) → insert
 *   - Existing row → update business_name + address + phone + enabled_forms
 *   - contact_email is the natural key; can't be changed via import
 *
 * Validation gates per row:
 *   - business_name + contact_email required
 *   - email format (Zod)
 *   - enabled_forms codes must all exist in lib/forms/registry
 *   - field length caps mirror update-client
 *
 * Auth: admin-only (ADMIN_EMAILS env).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeClientAudit } from '@/lib/clientAuditLog';
import { isKnownForm, listFormIds, DEFAULT_FORM_ID } from '@/lib/forms/registry';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const nullableTrim = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => {
      if (v === undefined || v === null) return null;
      const t = v.trim();
      return t === '' ? null : t;
    });

const RowSchema = z.object({
  business_name: z.string().min(1).max(200).transform((v) => v.trim()),
  contact_email: z.string().email().max(320).transform((v) => v.trim().toLowerCase()),
  contact_name: nullableTrim(200),
  phone: nullableTrim(50),
  business_address1: nullableTrim(200),
  business_address2: nullableTrim(200),
  // City/state/zip aren't first-class columns today but we still surface them
  // for Brook in `notes` if she provides them — keeps the CSV round-trippable.
  city: nullableTrim(100),
  state: nullableTrim(40),
  zip: nullableTrim(20),
  // Pipe-separated form ids in CSV; UI splits them into array before POST.
  enabled_forms: z.array(z.string().trim()).optional().default([]),
  notes: nullableTrim(2000),
});

const BodySchema = z.object({
  agencyId: z.string().uuid(),
  dryRun: z.boolean().optional().default(false),
  rows: z.array(z.record(z.string(), z.any())).min(1).max(2000),
});

type RowOutcome = {
  rowIndex: number;
  business_name: string;
  contact_email: string;
  status: 'ok' | 'updated' | 'error';
  action?: 'insert' | 'update' | 'skip';
  message?: string;
  warnings?: string[];
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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid body', detail: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify the agency exists (defence against forged agencyId from the client).
  const { data: agency, error: agencyErr } = await admin
    .from('agencies')
    .select('id, name')
    .eq('id', body.agencyId)
    .maybeSingle<{ id: string; name: string }>();
  if (agencyErr) {
    return NextResponse.json({ error: 'db error', detail: agencyErr.message }, { status: 500 });
  }
  if (!agency) {
    return NextResponse.json({ error: 'agency not found' }, { status: 404 });
  }

  const knownForms = new Set(listFormIds());
  const knownFormsList = listFormIds().join(', ');

  // Pre-load all existing clients under this agency so we can detect upserts
  // without N+1 queries. Brook's roster fits comfortably in memory.
  const { data: existingClients, error: exErr } = await admin
    .from('coi_clients')
    .select('id, contact_email, business_name, business_address1, business_address2, contact_name, phone, enabled_forms')
    .eq('agency_id', body.agencyId)
    .returns<
      Array<{
        id: string;
        contact_email: string;
        business_name: string;
        business_address1: string | null;
        business_address2: string | null;
        contact_name: string | null;
        phone: string | null;
        enabled_forms: string[];
      }>
    >();
  if (exErr) {
    return NextResponse.json({ error: 'db error', detail: exErr.message }, { status: 500 });
  }
  const existingByEmail = new Map((existingClients ?? []).map((c) => [c.contact_email.toLowerCase(), c]));

  // Dedupe within the inbound CSV — last-write-wins per email so a roster
  // with two rows for the same email surfaces a clear error.
  const seenInBatch = new Set<string>();

  const outcomes: RowOutcome[] = [];
  let inserted = 0;
  let updated = 0;
  let errored = 0;

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i];
    const baseOutcome = {
      rowIndex: i,
      business_name: String(raw?.business_name ?? ''),
      contact_email: String(raw?.contact_email ?? ''),
    };

    const parsed = RowSchema.safeParse(raw);
    if (!parsed.success) {
      outcomes.push({
        ...baseOutcome,
        status: 'error',
        message: parsed.error.issues.map((iss) => `${iss.path.join('.')}: ${iss.message}`).join('; '),
      });
      errored++;
      continue;
    }
    const row = parsed.data;

    // Validate enabled_forms against the registry.
    const badForms = row.enabled_forms.filter((f) => !isKnownForm(f));
    if (badForms.length > 0) {
      outcomes.push({
        ...baseOutcome,
        business_name: row.business_name,
        contact_email: row.contact_email,
        status: 'error',
        message: `Unknown form codes: ${badForms.join(', ')}. Known forms: ${knownFormsList}.`,
      });
      errored++;
      continue;
    }
    const enabledForms = row.enabled_forms.length > 0 ? row.enabled_forms : [DEFAULT_FORM_ID];

    // De-dupe within the batch.
    if (seenInBatch.has(row.contact_email)) {
      outcomes.push({
        ...baseOutcome,
        business_name: row.business_name,
        contact_email: row.contact_email,
        status: 'error',
        message: `Duplicate contact_email "${row.contact_email}" earlier in the CSV. Each email may appear only once per import.`,
      });
      errored++;
      continue;
    }
    seenInBatch.add(row.contact_email);

    const existing = existingByEmail.get(row.contact_email);
    const action: 'insert' | 'update' = existing ? 'update' : 'insert';
    const warnings: string[] = [];
    if (existing) {
      warnings.push(`Existing client "${existing.business_name}" will be updated.`);
    }

    // In dry-run mode, we stop here per-row.
    if (body.dryRun) {
      outcomes.push({
        ...baseOutcome,
        business_name: row.business_name,
        contact_email: row.contact_email,
        status: action === 'update' ? 'updated' : 'ok',
        action,
        warnings,
      });
      if (action === 'insert') inserted++;
      else updated++;
      continue;
    }

    // Commit: insert or update via service-role.
    try {
      if (action === 'insert') {
        const { data: ins, error: insErr } = await admin
          .from('coi_clients')
          .insert({
            agency_id: body.agencyId,
            business_name: row.business_name,
            contact_email: row.contact_email,
            contact_name: row.contact_name,
            phone: row.phone,
            business_address1: row.business_address1,
            business_address2: row.business_address2,
            enabled_forms: enabledForms,
            active: true,
          })
          .select('id')
          .single();
        if (insErr || !ins) throw insErr ?? new Error('insert returned no row');

        // Audit best-effort.
        try {
          await writeClientAudit(admin, {
            clientId: ins.id,
            action: 'updated',
            actorEmail: email,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
            diff: {
              business_name: { from: null, to: row.business_name },
              contact_email: { from: null, to: row.contact_email },
              enabled_forms: { from: null, to: enabledForms.join('|') },
            },
          });
        } catch (auditErr) {
          log.warn('importClients.audit_failed', { clientId: ins.id, error: (auditErr as Error).message });
        }

        outcomes.push({ ...baseOutcome, business_name: row.business_name, contact_email: row.contact_email, status: 'ok', action: 'insert', warnings });
        inserted++;
      } else {
        // Update existing — only overwrite columns the importer owns.
        const updatePayload: Record<string, unknown> = {
          business_name: row.business_name,
          contact_name: row.contact_name,
          phone: row.phone,
          business_address1: row.business_address1,
          business_address2: row.business_address2,
          enabled_forms: enabledForms,
        };
        const { error: updErr } = await admin
          .from('coi_clients')
          .update(updatePayload)
          .eq('id', existing!.id);
        if (updErr) throw updErr;

        try {
          await writeClientAudit(admin, {
            clientId: existing!.id,
            action: 'updated',
            actorEmail: email,
            actorIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
            diff: {
              business_name: { from: existing!.business_name, to: row.business_name },
              enabled_forms: {
                from: (existing!.enabled_forms ?? []).join('|'),
                to: enabledForms.join('|'),
              },
            },
          });
        } catch (auditErr) {
          log.warn('importClients.audit_failed', { clientId: existing!.id, error: (auditErr as Error).message });
        }

        outcomes.push({ ...baseOutcome, business_name: row.business_name, contact_email: row.contact_email, status: 'updated', action: 'update', warnings });
        updated++;
      }
    } catch (err) {
      outcomes.push({
        ...baseOutcome,
        business_name: row.business_name,
        contact_email: row.contact_email,
        status: 'error',
        message: (err as Error).message,
      });
      errored++;
    }
  }

  log.info('importClients.completed', {
    agencyId: body.agencyId,
    by: email,
    dryRun: body.dryRun,
    inserted,
    updated,
    errored,
    totalRows: body.rows.length,
  });

  return NextResponse.json({
    ok: errored === 0,
    dryRun: body.dryRun,
    agencyId: body.agencyId,
    summary: { inserted, updated, errored, totalRows: body.rows.length },
    outcomes,
  });
}
