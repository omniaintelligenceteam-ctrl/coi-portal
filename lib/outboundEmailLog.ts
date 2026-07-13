/**
 * Outbound email delivery ledger (outbound_email_log).
 *
 * logOutboundEmail records a Resend send; the /api/webhooks/resend route
 * advances the row's status as Resend reports delivery events. Logging is
 * deliberately non-fatal — a ledger write must never unwind a send that
 * already happened.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from './logger';

export type OutboundEmailCategory =
  | 'cert_delivery'
  | 'void_notice'
  | 'rejection'
  | 'expiry_warning';

export type OutboundEmailStatus =
  | 'sent'
  | 'delivery_delayed'
  | 'delivered'
  | 'opened'
  | 'bounced'
  | 'complained';

/**
 * Whether a webhook event may overwrite the current status. Higher rank wins;
 * bounced/complained are terminal — a late "delivered" for a message the
 * provider already bounced must not repaint it green.
 */
const STATUS_RANK: Record<OutboundEmailStatus, number> = {
  sent: 0,
  delivery_delayed: 1,
  delivered: 2,
  opened: 3,
  bounced: 10,
  complained: 10,
};

export function shouldAdvanceStatus(
  current: OutboundEmailStatus,
  incoming: OutboundEmailStatus,
): boolean {
  return STATUS_RANK[incoming] > STATUS_RANK[current];
}

/** Map a Resend webhook event type to a ledger status. Unknown types → null (ignore). */
export function statusForResendEvent(eventType: string): OutboundEmailStatus | null {
  switch (eventType) {
    case 'email.delivered':
      return 'delivered';
    case 'email.delivery_delayed':
      return 'delivery_delayed';
    case 'email.bounced':
      return 'bounced';
    case 'email.complained':
      return 'complained';
    case 'email.opened':
      return 'opened';
    default:
      return null;
  }
}

export async function logOutboundEmail(
  admin: SupabaseClient,
  entry: {
    resendEmailId: string;
    category: OutboundEmailCategory;
    to: string;
    cc?: string[];
    subject?: string;
    certRequestId?: string | null;
    certNumber?: string | null;
    clientId?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from('outbound_email_log').insert({
    resend_email_id: entry.resendEmailId,
    category: entry.category,
    to_email: entry.to,
    cc_emails: entry.cc?.length ? entry.cc : null,
    subject: entry.subject ?? null,
    cert_request_id: entry.certRequestId ?? null,
    cert_number: entry.certNumber ?? null,
    client_id: entry.clientId ?? null,
  });
  if (error) {
    log.warn('outboundEmailLog.insert_failed', {
      resendEmailId: entry.resendEmailId,
      category: entry.category,
      error: error.message,
    });
  }
}

export type DeliveryState = {
  status: OutboundEmailStatus;
  lastEventAt: string | null;
  bounceReason: string | null;
};

/** Latest delivery state of the cert-delivery email for a request, if logged. */
export async function getCertDeliveryState(
  admin: SupabaseClient,
  certRequestId: string,
): Promise<DeliveryState | null> {
  const { data, error } = await admin
    .from('outbound_email_log')
    .select('status, last_event_at, bounce_reason')
    .eq('cert_request_id', certRequestId)
    .eq('category', 'cert_delivery')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ status: OutboundEmailStatus; last_event_at: string | null; bounce_reason: string | null }>();
  if (error || !data) return null;
  return {
    status: data.status,
    lastEventAt: data.last_event_at,
    bounceReason: data.bounce_reason,
  };
}
