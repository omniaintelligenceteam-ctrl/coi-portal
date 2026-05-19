/**
 * Agent-native Certificate of Insurance API.
 *
 * POST /api/v1/certificates
 * Authorization: Bearer ${AGENT_API_KEY}
 *
 * Body:
 *   clientEmail    — contact_email of the coi_clients record
 *   holder         — { name, address1, address2? }
 *   selectedPolicyIds? — UUIDs; omit to include all active eligible policies
 *
 * Returns:
 *   { certNumber, requestId, status: "queued", verifyUrl, trackUrl }
 *
 * Notes:
 * - Reviewer runs asynchronously via after() (same as web form)
 * - Rate limits and expiry gates apply identically
 * - Set AGENT_API_KEY in env to enable; endpoint returns 503 if unset
 */

import { NextResponse, type NextRequest, after } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { reviewCert, type ClientOverride } from '@/lib/reviewerAgent';
import { sendQueueNotification } from '@/lib/email';
import { generateCertificate } from '@/lib/certPipeline';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const BodySchema = z.object({
  clientEmail: z.string().email(),
  holder: z.object({
    name: z.string().min(1).max(200),
    address1: z.string().min(1).max(200),
    address2: z.string().max(200).optional().default(''),
  }),
  selectedPolicyIds: z.array(z.string().uuid()).optional(),
});

export async function POST(req: NextRequest) {
  // Auth: Bearer token
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'agent API not configured on this instance' }, { status: 503 });
  }
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader !== `Bearer ${apiKey}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const admin = createAdminClient();

  const result = await generateCertificate({
    admin,
    clientEmail: body.clientEmail,
    holder: body.holder,
    selectedPolicyIds: body.selectedPolicyIds,
    requestedByEmail: `api:${body.clientEmail}`,
    requestedIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    source: 'api',
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const { certNumber, requestId, coiInput, client } = result;
  const holderName = result.coiInput.holder.name;

  // Background reviewer (fire-and-forget; serverless function stays alive via after())
  after(async () => {
    try {
      const { data: overrides } = await admin
        .from('client_overrides')
        .select('scope, pattern, correction')
        .eq('client_id', client.id)
        .eq('active', true)
        .returns<ClientOverride[]>();

      const review = await reviewCert({ request: coiInput, clientOverrides: overrides ?? [] });

      // Guard on status='pending' so this background write can't clobber a row
      // Brook has already decided while the reviewer was running.
      const { data: reviewedRow } = await admin
        .from('cert_requests')
        .update({
          reviewer_pass: review.pass,
          reviewer_flags: review.flags,
          reviewer_notes: review.notes,
          reviewer_model: review.model,
          reviewed_at: new Date().toISOString(),
          status: 'reviewed',
        })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id')
        .maybeSingle();

      if (!reviewedRow) {
        log.info('v1.cert.review_skipped_already_decided', { certNumber, requestId });
        return;
      }

      await sendQueueNotification({
        certNumber,
        requestId,
        clientName: client.business_name,
        holderName,
        reviewerPass: review.pass,
        flagCount: review.flags.length,
      });
    } catch (err) {
      log.error('v1.cert.reviewer_failed', { certNumber, requestId, error: (err as Error).message });
      try {
        await sendQueueNotification({
          certNumber,
          requestId,
          clientName: client.business_name,
          holderName,
          reviewerPass: null,
          flagCount: 0,
        });
      } catch {}
    }
  });

  const portalBase = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/+$/, '') ?? 'https://coi-portal.vercel.app';
  return NextResponse.json({
    certNumber,
    requestId,
    status: 'queued',
    verifyUrl: `${portalBase}/verify/${certNumber}`,
    trackUrl: `${portalBase}/result/${certNumber}`,
  });
}
