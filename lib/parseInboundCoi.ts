/**
 * Extracts a structured COI request from a free-form client email body.
 *
 * Returns:
 *   - holderName, holderAddress1, holderAddress2 (when present)
 *   - policyHints: any explicit mentions like "GL only", "auto + GL", "all"
 *   - missing: list of fields the model couldn't extract with confidence
 *
 * The webhook uses `missing` to decide whether to fire the cert pipeline or
 * reply to the client asking only for the bits we couldn't infer.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const DEFAULT_MODEL = process.env.INBOUND_LLM_MODEL || 'claude-sonnet-4-6';

export type ParseInboundCoiInput = {
  subject: string;
  body: string;
  fromAddress: string;
  /** Optional merged prior-thread context so a "the address is 123 Main" followup resolves correctly. */
  threadSummary?: string;
};

export const ParsedCoiSchema = z.object({
  holderName: z.string().default(''),
  holderAddress1: z.string().default(''),
  holderAddress2: z.string().default(''),
  policyHints: z.array(z.string()).default([]),
  missing: z.array(z.enum(['holderName', 'holderAddress1'])).default([]),
});

export type ParsedCoi = z.infer<typeof ParsedCoiSchema>;

const SYSTEM_PROMPT = `You extract Certificate of Insurance request fields from free-form client emails.

Required fields the downstream system needs:
- holderName: the legal name of the party who needs to be listed as the certificate holder (the entity the COI is issued TO, not the insured business)
- holderAddress1: street address line 1 of the holder
- holderAddress2: optional city/state/zip or suite line (combine into one string, fine to leave blank)

Optional:
- policyHints: array of free-form strings describing which coverage lines they want (e.g. "GL only", "auto + GL", "general liability", "all coverages"). Empty array if not mentioned.

Hard rules:
- If thread context is provided, MERGE: use later messages as authoritative when fields conflict.
- Do NOT invent fields. If a holder address isn't clearly in the email, leave it blank and list "holderAddress1" in "missing".
- Do NOT confuse the SENDER's business with the holder. The sender is the insured business asking for a cert; the holder is whoever they want named on it.
- Ignore quoted reply chains ("On ___ wrote:") unless they contain the only mention of a required field.

Output strict JSON ONLY, no markdown fences, no preamble:
{
  "holderName": "string",
  "holderAddress1": "string",
  "holderAddress2": "string",
  "policyHints": [],
  "missing": ["holderName" | "holderAddress1", ...]
}`;

function formatUserMessage(input: ParseInboundCoiInput): string {
  const parts: string[] = [];
  parts.push(`Sender: ${input.fromAddress}`);
  parts.push(`Subject: ${input.subject || '(empty)'}`);
  if (input.threadSummary) {
    parts.push(`Prior thread:\n${input.threadSummary}`);
  }
  parts.push(`\nLatest body:\n${input.body}`);
  return parts.join('\n');
}

export async function parseInboundCoi(
  input: ParseInboundCoiInput,
  client?: Pick<Anthropic, 'messages'>,
): Promise<ParsedCoi> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 768,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: formatUserMessage(input) }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('parseInboundCoi: no text block in response');
  }

  const raw = textBlock.text.trim();
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`parseInboundCoi: invalid JSON from model: ${raw.slice(0, 200)}`);
  }

  const result = ParsedCoiSchema.parse(parsed);

  // Belt-and-suspenders: rebuild `missing` from observed values so we don't
  // trust the model if it claims fields are missing but actually provided them.
  const computedMissing: ('holderName' | 'holderAddress1')[] = [];
  if (!result.holderName.trim()) computedMissing.push('holderName');
  if (!result.holderAddress1.trim()) computedMissing.push('holderAddress1');
  result.missing = computedMissing;
  return result;
}
