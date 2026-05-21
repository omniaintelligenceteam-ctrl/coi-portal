/**
 * Reviewer agent — second pair of eyes before a cert reaches Brook's approval queue.
 *
 * Runs server-side between PDF render and queue write. Reads the rendered cert
 * values + any prior corrections Brook has logged for this client. Returns
 * structured JSON the admin queue can render alongside the cert preview.
 *
 * Brook is the gatekeeper for manual-mode clients — this agent flags, she
 * decides. For clients with `auto_approve_enabled = true`, reviewer flags
 * are recorded for audit but do NOT block sending; the cert ships to the
 * client's email regardless of pass/fail.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CoiInput } from './types';

export type ClientOverride = {
  scope: 'holder' | 'coverage' | 'general';
  pattern: string;
  correction: string;
};

export type ReviewFlag = {
  field: string;                         // e.g. 'holder.address1', 'coverages[0].limits.eachOccurrence'
  severity: 'error' | 'warning' | 'info';
  message: string;
};

export type ReviewInput = {
  request: CoiInput;
  clientOverrides?: ClientOverride[];
};

export type ReviewOutput = {
  pass: boolean;
  flags: ReviewFlag[];
  notes: string;
  model: string;
  /**
   * 0-100 confidence the reviewer is willing to put on this cert being ready
   * to ship without Brook's eyes. Drives the graduated auto-approval lane
   * decision in lib/laneDecision.ts. Null if the reviewer crashed / parsing
   * failed — those rows safety-default to the manual lane.
   */
  confidenceScore: number | null;
  /**
   * One- to two-sentence explanation of the confidence score: what raised it,
   * what lowered it. Surfaced in the admin queue card and the client status
   * page so neither party is left guessing why a cert auto-approved or didn't.
   */
  confidenceReasoning: string | null;
};

const DEFAULT_MODEL = process.env.REVIEWER_MODEL || 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are a careful reviewer for Certificates of Insurance issued by The Policy Place.

Your job: read what's about to be sent on this cert and flag anything that looks wrong BEFORE it reaches the agent for approval. You are the second pair of eyes, not the gatekeeper. Brook (the licensed agent) makes the final call.

Check for:
- Holder name complete and properly formatted (LLC/Inc/Corp suffix if applicable, no obvious typos)
- Holder address well-formed (street + city + state + zip — Sheffer-style address like "1425 N. Royal Ave. / Evansville, IN 47711" is fine)
- Coverage selections look intentional (no missing essential coverage for the holder type, no unusual mismatch with prior overrides)
- Limits within normal ranges (e.g. GL each-occurrence typically 1M+; flag anything under 100k)
- Anything contradicting prior corrections from Brook for this client (listed in the user message)
- Anything plain weird or unexpected

Output strict JSON only, no preamble, no markdown fences:
{
  "pass": boolean,                  // true ONLY if no flags at error severity
  "flags": [                        // empty array if all clean
    { "field": "string identifier", "severity": "error" | "warning" | "info", "message": "one sentence" }
  ],
  "notes": "string",                // brief summary for Brook, 1-2 sentences max
  "confidence_score": integer,      // 0-100, see scoring rubric below
  "confidence_reasoning": "string"  // one or two sentences explaining the score
}

Severity rules:
- "error": Brook MUST look at this (likely wrong, will get rejected by holder, or violates a prior correction)
- "warning": worth a glance (unusual but possibly intentional)
- "info": minor observation, no action needed

Confidence rubric (0-100, where 100 = "I would bet my own license on this"):

Start at 50 and adjust:
- +30 if every flag is at info severity (or there are no flags at all)
- +15 if the holder name + address appear to match a previous successful cert for this client (look at prior corrections for hints)
- +10 if the selected coverages include all on-file in-force policies (no unusual subset)
- +10 if limits look standard for the holder type (GL 1M+, AUTO 1M+, etc.)
- −20 for each warning flag
- −40 for each error flag
- −10 if any value contradicts a Brook override pattern for this client
- −10 if the holder is brand-new to this client (no precedent) AND the request looks routine — uncertainty is still uncertainty
- Clamp final to 0-100, round to integer

Scoring guideposts:
- 90-100: would auto-issue without hesitation, every signal positive
- 70-89:  routine cert, no errors, minor unknowns — fine after a brief holdback window
- 50-69:  some uncertainty worth Brook's eyes
- 0-49:   genuine problem or unusual scenario — Brook decides

Be honest. A confidence of 50 with a clear reasoning is more useful than a 95 that turns out wrong.`;

export async function reviewCert(
  input: ReviewInput,
  client?: Pick<Anthropic, 'messages'>,
): Promise<ReviewOutput> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: formatUserMessage(input) }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return {
      pass: false,
      flags: [{ field: 'reviewer', severity: 'error', message: 'Reviewer returned no text content.' }],
      notes: 'Brook should inspect manually — reviewer agent failed.',
      model: DEFAULT_MODEL,
      confidenceScore: null,
      confidenceReasoning: null,
    };
  }

  const parsed = parseReviewerOutput(textBlock.text);
  return { ...parsed, model: DEFAULT_MODEL };
}

export function formatUserMessage(input: ReviewInput): string {
  const { request, clientOverrides } = input;
  const overridesSection =
    clientOverrides && clientOverrides.length > 0
      ? `\n\nPrior corrections from Brook for this client:\n${clientOverrides
          .map((o) => `- [${o.scope}] when ${o.pattern} → ${o.correction}`)
          .join('\n')}`
      : '\n\n(No prior corrections on file for this client.)';

  const coveragesText = request.coverages
    .map((c) => {
      const base = `  - ${c.type}: insurer ${c.insurerLetter}, policy ${c.policyNumber}, ${c.effDate} → ${c.expDate}`;
      const flags = [
        c.addlInsuredBlanket ? 'AI-blanket' : null,
        c.subrogationWaived ? 'WoS' : null,
      ]
        .filter(Boolean)
        .join(', ');
      return flags ? `${base}, ${flags}` : base;
    })
    .join('\n');

  return `Review this cert about to be queued for Brook's approval.

Agency: ${request.agency.name} (${request.agency.email})

Insured: ${request.insured.name}
  ${request.insured.address1}${request.insured.address2 ? '\n  ' + request.insured.address2 : ''}

Holder requested:
  ${request.holder.name}
  ${request.holder.address1}${request.holder.address2 ? '\n  ' + request.holder.address2 : ''}

Coverages selected:
${coveragesText}

Cert number: ${request.certNumber}
Cert date: ${request.certDate}${overridesSection}

Return your review as strict JSON.`;
}

export function parseReviewerOutput(text: string): {
  pass: boolean;
  flags: ReviewFlag[];
  notes: string;
  confidenceScore: number | null;
  confidenceReasoning: string | null;
} {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    const rawScore = parsed.confidence_score;
    const score =
      typeof rawScore === 'number' && Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : null;
    const reasoning =
      typeof parsed.confidence_reasoning === 'string' && parsed.confidence_reasoning.trim().length > 0
        ? parsed.confidence_reasoning.trim()
        : null;
    return {
      pass: Boolean(parsed.pass),
      flags: Array.isArray(parsed.flags)
        ? parsed.flags.filter(isValidFlag)
        : [],
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
      confidenceScore: score,
      confidenceReasoning: reasoning,
    };
  } catch {
    return {
      pass: false,
      flags: [
        {
          field: 'reviewer',
          severity: 'error',
          message: 'Reviewer returned malformed JSON; manual inspection required.',
        },
      ],
      notes: 'Reviewer agent output could not be parsed.',
      confidenceScore: null,
      confidenceReasoning: null,
    };
  }
}

function isValidFlag(flag: unknown): flag is ReviewFlag {
  if (!flag || typeof flag !== 'object') return false;
  const f = flag as Record<string, unknown>;
  return (
    typeof f.field === 'string' &&
    typeof f.message === 'string' &&
    (f.severity === 'error' || f.severity === 'warning' || f.severity === 'info')
  );
}
