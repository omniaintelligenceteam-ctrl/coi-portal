/**
 * Twilio webhook — inbound SMS to coi@/+1XXX.
 *
 * Conversational COI agent over SMS. Same tools, same trust ladder, same
 * pipeline — just a different transport. Each inbound message routes through
 * the same Anthropic + tool loop the chat widget uses.
 *
 * Flow:
 *   1. Twilio POSTs application/x-www-form-urlencoded with From, To, Body
 *   2. Verify the X-Twilio-Signature header to confirm Twilio sent it
 *   3. Match From-number to a coi_clients row
 *   4. Run the same chat tools against that client's context
 *   5. Send the assistant's reply back via Twilio outbound SMS
 *   6. Persist the exchange to chat_threads (single thread per client)
 *
 * Configure Twilio: in the Twilio console → Phone Numbers → your number →
 * Messaging → A MESSAGE COMES IN webhook URL =
 *   https://coi-portal.vercel.app/api/sms/inbound  (POST, raw form)
 *
 * Env required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER,
 * ANTHROPIC_API_KEY. Missing any of them returns 200 with a graceful no-op
 * so the webhook doesn't retry-storm in production.
 */

import Anthropic from '@anthropic-ai/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CHAT_TOOLS, runTool, type ChatClientCtx } from '@/lib/chatTools';
import {
  findClientByPhone,
  readSmsConfig,
  sendSms,
  verifyTwilioSignature,
} from '@/lib/sms';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_MODEL = process.env.CHAT_MODEL || 'claude-sonnet-4-6';
const MAX_TOOL_HOPS = 6;

const SYSTEM_PROMPT = `You are the SMS COI assistant for The Policy Place. Brook Gaudy's insureds text you when they need a Certificate of Insurance. Replies must fit in a single SMS (under 300 characters). No markdown, no formatting, plain prose.

Same rules as the chat widget: confirm before submitting (read it back, ask "ok to send?"), one question per reply, plain English, don't promise endorsements that aren't on file.

If the insured hasn't given you enough to act, ask the one missing thing. If they say "send the same one as last time", call list_my_recent_certificates first.`;

export async function POST(req: NextRequest) {
  const cfg = readSmsConfig();
  if (!cfg || !process.env.ANTHROPIC_API_KEY) {
    log.warn('sms.inbound.skipped_no_config');
    return new NextResponse('', { status: 200 });
  }

  // Twilio posts application/x-www-form-urlencoded
  const formText = await req.text();
  const params = Object.fromEntries(new URLSearchParams(formText));

  const signature = req.headers.get('x-twilio-signature') ?? '';
  const url = (() => {
    const fwdProto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('host') ?? '';
    return `${fwdProto}://${host}${req.nextUrl.pathname}`;
  })();

  if (
    !verifyTwilioSignature({
      authToken: cfg.authToken,
      url,
      params: params as Record<string, string>,
      signature,
    })
  ) {
    log.warn('sms.inbound.bad_signature', { from: params.From });
    return new NextResponse('forbidden', { status: 403 });
  }

  const fromNumber = (params.From ?? '').trim();
  const body = (params.Body ?? '').trim();
  if (!fromNumber || !body) {
    return new NextResponse('', { status: 200 });
  }

  const admin = createAdminClient();
  const client = await findClientByPhone(admin, fromNumber);

  if (!client) {
    await sendSms({
      to: fromNumber,
      body: "We don't have this number linked to a client account. Email brook@yourpolicyplace.com to get set up.",
    });
    return new NextResponse('', { status: 200 });
  }

  // Load the most recent thread for this client so SMS conversations have
  // memory across messages. One thread per insured matches the chat widget.
  const { data: thread } = await admin
    .from('chat_threads')
    .select('messages')
    .eq('client_id', client.id)
    .maybeSingle();

  const priorMessages =
    (thread?.messages as unknown as Array<Anthropic.MessageParam> | undefined) ?? [];
  const conversation: Array<Anthropic.MessageParam> = [
    ...priorMessages,
    { role: 'user', content: body } as Anthropic.MessageParam,
  ];

  // Tool execution context — same shape as the chat widget. Note we don't
  // have a request IP (Twilio is the requester); leave null. requestedByEmail
  // uses the insured's contact_email so the cert is audit-trailed correctly.
  const ctx: ChatClientCtx = {
    client: {
      id: client.id,
      agency_id: '', // populated below from the full row
      business_name: client.business_name,
      business_address1: null,
      business_address2: null,
    },
    requestedByEmail: client.contact_email,
    requestedIp: null,
    reader: admin, // service-role read; SMS doesn't have a user session
    admin,
  };

  // Fill in agency_id + addresses for the issueCert call paths.
  const { data: full } = await admin
    .from('coi_clients')
    .select('agency_id, business_address1, business_address2')
    .eq('id', client.id)
    .maybeSingle();
  if (full) {
    ctx.client.agency_id = (full as { agency_id: string }).agency_id;
    ctx.client.business_address1 = (full as { business_address1: string | null }).business_address1;
    ctx.client.business_address2 = (full as { business_address2: string | null }).business_address2;
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let finalText = '';
  for (let hop = 0; hop < MAX_TOOL_HOPS; hop++) {
    const response = await anthropic.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 512, // shorter than chat widget — SMS replies must fit
      system: SYSTEM_PROMPT,
      tools: CHAT_TOOLS as unknown as Anthropic.Tool[],
      messages: conversation,
    });

    const assistantTurn: Anthropic.MessageParam = {
      role: 'assistant',
      content: response.content as Anthropic.MessageParam['content'],
    };
    conversation.push(assistantTurn);

    if (response.stop_reason !== 'tool_use') {
      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === 'text',
      );
      finalText = textBlock?.text?.trim() ?? '';
      break;
    }

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
      try {
        const result = await runTool(ctx, use.name, use.input as Record<string, unknown>);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
          is_error: true,
        });
      }
    }
    conversation.push({
      role: 'user',
      content: toolResults as unknown as Anthropic.MessageParam['content'],
    });
  }

  if (!finalText) {
    finalText = "Got your message. Let me check with Brook and follow up.";
  }

  // Send reply + persist thread (best effort, non-blocking on each).
  await sendSms({ to: fromNumber, body: finalText });
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
    log.warn('sms.thread_persist_failed', {
      clientId: client.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Twilio expects a 200 with an empty body (or TwiML if we wanted to reply
  // synchronously). We send the reply via the REST API so the webhook
  // response can stay empty.
  return new NextResponse('', { status: 200 });
}
