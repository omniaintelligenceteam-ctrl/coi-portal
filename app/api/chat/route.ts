/**
 * Conversational COI agent — server endpoint.
 *
 * The client-facing ChatWidget posts a conversation history here. The server:
 *   1. Verifies the user is an authenticated insured (not an admin)
 *   2. Loads the insured's coi_clients row (the context every tool acts on)
 *   3. Calls Anthropic with the tool definitions + conversation
 *   4. If the model wants to call a tool, executes it server-side, appends
 *      the tool result, and loops back to the model
 *   5. Returns the final assistant text + the new tool-use turns
 *
 * Hard rule: tools always run with the AUTHENTICATED insured's context.
 * The LLM cannot pretend to act on behalf of another client by passing
 * a different client_id — tools take their client context from the
 * server-side session, never from the LLM's tool input.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CHAT_TOOLS, runTool, type ChatClientCtx } from '@/lib/chatTools';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_HOPS = 6;

// Message shape we accept from the client. Mirrors Anthropic's message shape
// (role: 'user' | 'assistant'). Content is either a plain string from the
// user or a structured array on assistant turns (text + tool_use blocks).
const InboundMessage = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal('text'), text: z.string() }),
          z.object({
            type: z.literal('tool_result'),
            tool_use_id: z.string(),
            content: z.string(),
          }),
        ]),
      ),
    ]),
  }),
  z.object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z.array(z.unknown()),
    ]),
  }),
]);

const BodySchema = z.object({
  messages: z.array(InboundMessage).min(1).max(40),
});

const SYSTEM_PROMPT = `You are the conversational COI assistant for The Policy Place, Brook Gaudy's insurance agency in Benton KY.

The user is one of Brook's insured clients. They need to request Certificates of Insurance — a routine document an insurance agent issues that confirms an insured business has the coverage their counterparties require. Your job: hold a natural conversation, extract who the cert is FOR (the "holder") and what coverages it should include, then submit a request via the submit_certificate_request tool.

Style:
- Warm, professional, brief. You are talking to a small-business owner, not a developer.
- Plain English. Never use jargon ("Certificate Holder" is fine; "AcroForm field" is not).
- One question at a time. Don't ask for the holder name and address in the same turn — ask for the name, get it, then ask for the address.
- Confirm before submitting. Always read back what you're about to send and wait for explicit yes.
- If something is unclear or ambiguous, ask — don't guess.

What you can do (tools):
- list_my_active_policies — see which coverages this insured has on file
- list_my_recent_holders — see holders this insured has used before, for "the same one as last time"
- list_my_recent_certificates — see what this insured has sent recently
- submit_certificate_request — issues the cert; only AFTER explicit user confirmation

What you should NOT do:
- Don't promise specific limits or endorsements (additional insured, waiver of subrogation) — those depend on the policy itself
- Don't speculate about coverage that isn't on file. If the user asks for something they don't have, gently say so and suggest they reach Brook
- Don't act on behalf of someone else's insured account — every tool runs against the authenticated user's account, you can't change that

Greet briefly on the first turn. Get to work fast — the user came here to get a cert done, not to chat.`;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'chat is not configured (missing ANTHROPIC_API_KEY)' },
      { status: 500 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.includes(user.email.toLowerCase())) {
    return NextResponse.json(
      { error: 'admin chat not supported here — use the queue or Cmd-K' },
      { status: 403 },
    );
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

  // Load the insured's client row — server-side, not from the LLM.
  const { data: client } = await supabase
    .from('coi_clients')
    .select('id, agency_id, business_name, business_address1, business_address2')
    .eq('contact_email', user.email.toLowerCase())
    .maybeSingle();

  if (!client) {
    return NextResponse.json(
      { error: 'no client account', detail: 'This email is not linked to a Policy Place insured account.' },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const ctx: ChatClientCtx = {
    client: {
      id: client.id,
      agency_id: client.agency_id,
      business_name: client.business_name,
      business_address1: client.business_address1,
      business_address2: client.business_address2,
    },
    requestedByEmail: user.email,
    requestedIp: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    reader: supabase,
    admin,
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Replay loop: call the model. If it stop_reason='tool_use', execute the
  // tools, append a tool_result user turn, and call again. Cap hops to
  // MAX_TOOL_HOPS so a runaway loop can't burn the request.
  // The conversation passed back to the client at the end is just the new
  // turns produced this round; the client's responsibility is to merge them
  // with its existing state.
  const conversation: Array<Anthropic.MessageParam> = body.messages.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam['content'],
  }));

  const newTurns: Array<Anthropic.MessageParam> = [];
  let finalText = '';

  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: CHAT_TOOLS as unknown as Anthropic.Tool[],
      messages: conversation,
    });

    // Persist the assistant turn as-is so the client can render text +
    // tool-use blocks consistently and so the next hop's conversation
    // includes it.
    const assistantTurn: Anthropic.MessageParam = {
      role: 'assistant',
      content: response.content as Anthropic.MessageParam['content'],
    };
    conversation.push(assistantTurn);
    newTurns.push(assistantTurn);

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      finalText = textBlock?.text ?? '';
      break;
    }

    // Execute every tool the model invoked this turn, in parallel where
    // possible. Each result becomes a tool_result content block in the next
    // user turn.
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    const toolResults: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
      is_error?: boolean;
    }> = [];

    for (const use of toolUses) {
      let result: unknown;
      let isError = false;
      try {
        result = await runTool(ctx, use.name, use.input as Record<string, unknown>);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
        isError = true;
        log.warn('chat.tool_failed', {
          tool: use.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: JSON.stringify(result),
        is_error: isError || undefined,
      });
    }

    const toolResultsTurn: Anthropic.MessageParam = {
      role: 'user',
      content: toolResults as unknown as Anthropic.MessageParam['content'],
    };
    conversation.push(toolResultsTurn);
    newTurns.push(toolResultsTurn);
  }

  // Persist the full conversation to chat_threads for cross-session restore.
  // Best-effort: if the migration hasn't been applied or the upsert fails,
  // log and keep going — the response to the user shouldn't depend on it.
  try {
    await admin
      .from('chat_threads')
      .upsert(
        {
          client_id: client.id,
          messages: conversation as unknown as Record<string, unknown>[],
          last_message_at: new Date().toISOString(),
        },
        { onConflict: 'client_id' },
      );
  } catch (err) {
    log.warn('chat.thread_persist_failed', {
      clientId: client.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    text: finalText,
    newTurns,
    model: DEFAULT_MODEL,
  });
}
