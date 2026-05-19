/**
 * Claude-powered declarations page extractor.
 * Accepts a base64-encoded PDF or image, returns structured policy JSON.
 * Admin-only.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const BodySchema = z.object({
  fileBase64: z.string().min(1),
  mediaType: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
  ]),
});

const EXTRACTION_PROMPT = `You are an insurance policy data extractor. Extract structured data from this declarations page and return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.

Use this exact schema:
{
  "type": "GL" | "WC" | "AUTO" | "UMBRELLA" | "EQUIPMENT",
  "policyNumber": "string",
  "effDate": "YYYY-MM-DD",
  "expDate": "YYYY-MM-DD",
  "insurerName": "string",
  "insurerNaic": "string or null",
  "limits": {
    "GL type — include whichever are present":
      "eachOccurrence", "damageToRented", "medExp", "personalAdvInjury",
      "generalAggregate", "productsCompOp",
    "AUTO type":
      "combinedSingleLimit", "bodilyInjuryPerPerson",
      "bodilyInjuryPerAccident", "propertyDamage",
    "UMBRELLA type":
      "eachOccurrence", "aggregate", "retention",
    "WC type":
      "eachAccident", "diseaseEaEmployee", "diseasePolicyLimit",
    "EQUIPMENT type":
      "equipmentLimit"
  },
  "addlInsuredBlanket": false,
  "subrogationWaived": false,
  "description": "string or null"
}

Type classification:
- GL = Commercial General Liability
- WC = Workers' Compensation
- AUTO = Commercial Auto / Business Auto
- UMBRELLA = Umbrella or Excess Liability
- EQUIPMENT = Inland Marine / Contractors Equipment / Scheduled Equipment

Rules:
- Dollar amounts in limits must be numbers only (no $ or commas). E.g. 1000000 not "$1,000,000".
- Dates must be YYYY-MM-DD.
- If a field is not found on the document, use null.
- Set addlInsuredBlanket=true only if the document explicitly shows Additional Insured endorsement.
- Set subrogationWaived=true only if Waiver of Subrogation is noted.`;

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
    return NextResponse.json({ error: 'invalid body', detail: String(err) }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const t0 = Date.now();
    const isPdf = body.mediaType === 'application/pdf';

    const content: Anthropic.MessageParam['content'] = isPdf
      ? [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: body.fileBase64,
            },
          } as unknown as Anthropic.TextBlockParam,
          { type: 'text', text: EXTRACTION_PROMPT },
        ]
      : [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: body.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: body.fileBase64,
            },
          },
          { type: 'text', text: EXTRACTION_PROMPT },
        ];

    const response = await anthropic.messages.create({
      model: process.env.REVIEWER_MODEL ?? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    });

    const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const extracted = JSON.parse(raw);

    log.info('policy.extracted', { durationMs: Date.now() - t0, type: extracted.type });
    return NextResponse.json({ extracted });
  } catch (err) {
    log.error('policy.extract_failed', { error: (err as Error).message });
    return NextResponse.json(
      { error: 'extraction failed', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
