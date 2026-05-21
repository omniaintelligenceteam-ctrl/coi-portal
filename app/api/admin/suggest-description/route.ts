/**
 * Admin endpoint — AI-suggest a default description of operations.
 *
 * Brook clicks "Suggest" on the Master File tab's default-description
 * textarea. We pull the client's identity + active policies and ask Claude
 * to draft a professional, conservative description that an underwriter
 * would sign off on. Brook accepts / edits / discards.
 *
 * Body: { clientId: uuid }
 * Returns: { suggestion: string, model: string }
 *
 * Falls back to a stub if ANTHROPIC_API_KEY isn't set, so the button works
 * (visibly degraded) in environments without the key configured.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectableCoverages } from '@/lib/getClientPolicies';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  clientId: z.string().uuid(),
});

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other',
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

  // Load client + active policies. Same selectable-coverages logic the cert
  // pipeline uses so we don't suggest descriptions referencing expired
  // coverages.
  const [{ data: client }, { data: policiesRaw }] = await Promise.all([
    admin
      .from('coi_clients')
      .select('business_name, business_address1, business_address2, default_description')
      .eq('id', body.clientId)
      .maybeSingle(),
    admin
      .from('policies')
      .select(
        `id, type, policy_number, eff_date, exp_date, active,
         status, cancelled_at, cancelled_reason,
         addl_insured_blanket, subrogation_waived, description,
         limits_jsonb,
         insurer:insurers ( name, naic )`,
      )
      .eq('client_id', body.clientId),
  ]);

  if (!client) {
    return NextResponse.json({ error: 'client not found' }, { status: 404 });
  }

  const today = new Date();
  const active = selectableCoverages(
    (policiesRaw ?? []) as Parameters<typeof selectableCoverages>[0],
    today,
  );

  // Stub fallback if no key configured — the button still produces something
  // useful so the UI doesn't feel broken on dev environments without
  // Anthropic credentials.
  if (!process.env.ANTHROPIC_API_KEY) {
    const types = active.map((p) => TYPE_LABEL[p.type]).filter(Boolean).join(', ') || 'standard commercial coverages';
    return NextResponse.json({
      suggestion: `Operations of ${client.business_name} as a commercial enterprise; ${types} as evidenced on this certificate. Project-specific endorsements apply per certificate.`,
      model: 'stub:no-anthropic-key',
    });
  }

  const policyLines = active.length === 0
    ? '(no active policies on file)'
    : active
        .map((p) => {
          const lim = p.limits_jsonb ?? {};
          const limStr = Object.entries(lim)
            .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
            .map(([k, v]) => `${k}: ${(v as number).toLocaleString()}`)
            .join(', ') || 'limits unset';
          return `  - ${TYPE_LABEL[p.type] ?? p.type}: ${p.policy_number ?? 'no number'} (${limStr})`;
        })
        .join('\n');

  const prompt = `You're drafting the "Description of Operations / Locations / Vehicles / Special Items" text that prints on every ACORD 25 Certificate of Insurance for this insured.

INSURED
  ${client.business_name}
  ${[client.business_address1, client.business_address2].filter(Boolean).join(', ') || '(no address on file)'}

CURRENT DEFAULT DESCRIPTION (may be empty)
  ${client.default_description?.trim() || '(none yet — Brook is filling this in for the first time)'}

ACTIVE POLICIES ON FILE
${policyLines}

Write ONE description, plain text, 1-3 sentences total. Conservative and underwriter-defensible. No marketing language. Mention the insured's general line of work if it's clear from the business name, otherwise stay generic. Mention "project-specific endorsements apply per certificate" so we don't paint ourselves into a corner.

Output the description text only — no preamble, no quotes, no markdown.`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.REVIEWER_MODEL || 'claude-sonnet-4-6';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    const suggestion = (textBlock?.text ?? '').trim();
    if (!suggestion) {
      return NextResponse.json(
        { error: 'empty response from model' },
        { status: 502 },
      );
    }
    log.info('description.suggested', {
      clientId: body.clientId,
      by: email,
      length: suggestion.length,
    });
    return NextResponse.json({ suggestion, model });
  } catch (err) {
    log.error('description.suggest_failed', {
      clientId: body.clientId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'model call failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
