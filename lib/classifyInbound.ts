/**
 * Classifies an inbound client email into one of four intents so the inbound
 * webhook can route correctly:
 *
 *   - new_request   : client is asking for a brand-new COI
 *   - followup_info : client is replying with previously-missing fields
 *                     (holder name, address) for an in-flight request
 *   - error_report  : client is complaining that a cert we sent is wrong
 *   - other         : anything else (greetings, unrelated questions, etc.)
 *
 * For `error_report` the classifier also tries to pull the cert number being
 * complained about (so Brook's URGENT email subject names it).
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const DEFAULT_MODEL = process.env.INBOUND_LLM_MODEL || 'claude-sonnet-4-6';

export type InboundContext = {
  subject: string;
  body: string;
  fromAddress: string;
  /** Optional thread context — prior subjects/bodies in the same References: chain. */
  threadSummary?: string;
  /** Optional list of recent cert numbers for this client (helps disambiguation). */
  recentCertNumbers?: string[];
};

export const ClassifiedSchema = z.object({
  intent: z.enum(['new_request', 'followup_info', 'error_report', 'other']),
  confidence: z.number().min(0).max(1),
  referencedCertNumber: z.string().optional(),
  errorSummary: z.string().optional(),
});

export type Classified = z.infer<typeof ClassifiedSchema>;

const SYSTEM_PROMPT = `You classify inbound emails sent to a Certificate of Insurance (COI) issuance service.

Possible intents:
- "new_request"   — sender is asking us to issue a NEW certificate of insurance. They name a holder or attach a request form.
- "followup_info" — sender is replying to an earlier message of ours where we asked for missing info (holder name, holder address). Usually short, just the answer.
- "error_report"  — sender is telling us a cert we already sent is wrong, has bad info, the wrong holder, the wrong address, expired, etc. They want it fixed.
- "other"         — anything else: thanks/greetings, unrelated questions, spam, out-of-office bounces, etc.

Also try to extract:
- "referencedCertNumber" — if the email mentions a cert number matching the pattern PP-YYYYMMDD-NNNN, return it.
- "errorSummary" — for error_report only, a one-sentence neutral summary of what the client says is wrong.

Output strict JSON ONLY, no markdown fences, no preamble:
{
  "intent": "new_request" | "followup_info" | "error_report" | "other",
  "confidence": 0.0-1.0,
  "referencedCertNumber": "PP-YYYYMMDD-NNNN" | undefined,
  "errorSummary": "string" | undefined
}`;

function formatUserMessage(ctx: InboundContext): string {
  const parts: string[] = [];
  parts.push(`Sender: ${ctx.fromAddress}`);
  parts.push(`Subject: ${ctx.subject || '(empty)'}`);
  if (ctx.recentCertNumbers?.length) {
    parts.push(`Recent certs we have sent this client: ${ctx.recentCertNumbers.join(', ')}`);
  }
  if (ctx.threadSummary) {
    parts.push(`Prior thread context:\n${ctx.threadSummary}`);
  }
  parts.push(`\nBody:\n${ctx.body}`);
  return parts.join('\n');
}

export async function classifyInbound(
  ctx: InboundContext,
  client?: Pick<Anthropic, 'messages'>,
): Promise<Classified> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: formatUserMessage(ctx) }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('classifyInbound: no text block in response');
  }

  const raw = textBlock.text.trim();
  // Tolerate any model that wrapped output in fences.
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`classifyInbound: invalid JSON from model: ${raw.slice(0, 200)}`);
  }
  return ClassifiedSchema.parse(parsed);
}
