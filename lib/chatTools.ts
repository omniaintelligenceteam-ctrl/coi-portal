/**
 * Tool implementations for the client-facing conversational COI agent.
 *
 * Each tool is a pure-ish server-side function that takes:
 *   - the authenticated client context (so we never trust arguments to
 *     change who we're acting on behalf of)
 *   - the tool-specific input
 * and returns a JSON-serializable result the LLM can read.
 *
 * Tool definitions live alongside their implementations so the schema +
 * behavior stay in sync.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { selectableCoverages, type DbPolicy } from './getClientPolicies';
import { issueCert, type IssueCertClient } from './issueCert';

export type ChatClientCtx = {
  client: IssueCertClient;
  requestedByEmail: string;
  requestedIp: string | null;
  reader: SupabaseClient;
  admin: SupabaseClient;
};

/**
 * The tool schemas we hand to Anthropic. Keep names + descriptions
 * conversational — the LLM uses these to decide which tool to call.
 */
export const CHAT_TOOLS = [
  {
    name: 'list_my_active_policies',
    description:
      "Look up the insured's currently-active, in-force insurance policies. Use this whenever the conversation needs to know which coverages they have, before submitting a cert request, or to answer 'what do I have on file'.",
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_my_recent_holders',
    description:
      "Look up the certificate holders this insured has issued to recently. Use when the user references 'the same one as last time', or when you need to fuzzy-match a holder name they typed.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum holders to return. Default 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_my_recent_certificates',
    description:
      "Look up the insured's recently-issued certificates so the user can reference 'the one I sent last week' or 'the McCracken cert'.",
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          description: 'Maximum certs to return. Default 5.',
        },
      },
      required: [],
    },
  },
  {
    name: 'submit_certificate_request',
    description:
      "Submit a new Certificate of Insurance request to Brook's queue. Only call this AFTER you have a clear holder name + holder street address AND you have confirmed the request with the user (read it back, ask 'shall I send it?'). The request will be reviewed by Brook (or auto-approved if the client is on auto-approve and the reviewer confidence is high) and emailed to the holder.",
    input_schema: {
      type: 'object',
      properties: {
        holder_name: {
          type: 'string',
          description: 'Legal name of the certificate holder (the company or person the cert is issued to).',
        },
        holder_address1: {
          type: 'string',
          description: 'Street address of the holder.',
        },
        holder_address2: {
          type: 'string',
          description: 'City, State ZIP of the holder. Empty string if unavailable.',
        },
        policy_ids: {
          type: 'array',
          items: { type: 'string' },
          description: "Array of policy UUIDs to include on the cert. Get these from list_my_active_policies. If the user doesn't specify, include all eligible policies.",
        },
      },
      required: ['holder_name', 'holder_address1', 'policy_ids'],
    },
  },
] as const;

export type ToolName = (typeof CHAT_TOOLS)[number]['name'];

/**
 * Execute a tool by name. Untrusted input from the LLM is validated here.
 */
export async function runTool(
  ctx: ChatClientCtx,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'list_my_active_policies':
      return listMyActivePolicies(ctx);
    case 'list_my_recent_holders':
      return listMyRecentHolders(ctx, parseLimit(input.limit, 10));
    case 'list_my_recent_certificates':
      return listMyRecentCerts(ctx, parseLimit(input.limit, 5));
    case 'submit_certificate_request':
      return submitCert(ctx, input);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/* ------- implementations ------- */

type PolicyRow = DbPolicy & {
  policy_number: string;
  insurer: { name: string } | null;
};

async function listMyActivePolicies(ctx: ChatClientCtx) {
  const { data } = await ctx.reader
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       status, cancelled_at, cancelled_reason,
       insurer:insurers ( name )`,
    )
    .eq('client_id', ctx.client.id)
    .order('exp_date', { ascending: false })
    .returns<PolicyRow[]>();

  const today = new Date();
  const eligible = selectableCoverages(data ?? [], today);

  return {
    policies: eligible.map((p) => ({
      id: p.id,
      type: p.type,
      policy_number: p.policy_number,
      eff_date: p.eff_date,
      exp_date: p.exp_date,
      insurer_name: p.insurer?.name ?? 'Unknown insurer',
    })),
    count: eligible.length,
    note:
      eligible.length === 0
        ? 'No active in-force policies on file. The insured needs to talk to Brook before any cert can be issued.'
        : undefined,
  };
}

async function listMyRecentHolders(ctx: ChatClientCtx, limit: number) {
  const { data } = await ctx.reader
    .from('cert_holders')
    .select('name, address1, address2, last_used_at')
    .eq('client_id', ctx.client.id)
    .order('last_used_at', { ascending: false })
    .limit(limit);

  return {
    holders: data ?? [],
    count: data?.length ?? 0,
  };
}

async function listMyRecentCerts(ctx: ChatClientCtx, limit: number) {
  const { data } = await ctx.reader
    .from('cert_requests')
    .select('cert_number, holder_name, status, requested_at, sent_at')
    .eq('client_id', ctx.client.id)
    .order('requested_at', { ascending: false })
    .limit(limit);

  return {
    certificates: data ?? [],
    count: data?.length ?? 0,
  };
}

async function submitCert(ctx: ChatClientCtx, input: Record<string, unknown>) {
  const holderName = strOrThrow(input.holder_name, 'holder_name');
  const holderAddress1 = strOrThrow(input.holder_address1, 'holder_address1');
  const holderAddress2 =
    typeof input.holder_address2 === 'string' ? input.holder_address2 : '';
  const policyIdsRaw = input.policy_ids;
  if (!Array.isArray(policyIdsRaw) || policyIdsRaw.length === 0) {
    return {
      ok: false,
      error: 'policy_ids must be a non-empty array of policy UUIDs from list_my_active_policies.',
    };
  }
  const policyIds = policyIdsRaw.filter((x): x is string => typeof x === 'string');

  const result = await issueCert({
    reader: ctx.reader,
    admin: ctx.admin,
    client: ctx.client,
    selectedPolicyIds: policyIds,
    holder: {
      name: holderName,
      address1: holderAddress1,
      address2: holderAddress2,
    },
    requestedByEmail: ctx.requestedByEmail,
    requestedIp: ctx.requestedIp,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, detail: result.detail };
  }

  return {
    ok: true,
    cert_number: result.certNumber,
    request_id: result.requestId,
    status_url: `/status/${encodeURIComponent(result.certNumber)}`,
    message:
      "Submitted. Brook (or her reviewer agent) will release it shortly; the insured will receive an email at the holder address.",
  };
}

/* ------- helpers ------- */

function parseLimit(raw: unknown, fallback: number): number {
  const n = typeof raw === 'number' ? Math.floor(raw) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(50, n);
}

function strOrThrow(v: unknown, name: string): string {
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`Tool input '${name}' is required.`);
  }
  return v.trim();
}
