-- Outbound email delivery ledger.
--
-- Inbound email is already logged (inbound_email_log); outbound was
-- fire-and-forget — Resend returned a message id and we dropped it, so
-- "did the holder actually receive the cert" was unanswerable (E&O exposure).
-- This table records every E&O-relevant outbound send and its delivery state,
-- updated by the Resend webhook at /api/webhooks/resend.

create table if not exists outbound_email_log (
  id               uuid primary key default gen_random_uuid(),
  resend_email_id  text unique not null,
  -- cert_delivery | void_notice | rejection | expiry_warning
  category         text not null,
  to_email         text not null,
  cc_emails        text[],
  subject          text,
  cert_request_id  uuid references cert_requests(id) on delete set null,
  cert_number      text,
  client_id        uuid references coi_clients(id) on delete set null,
  -- sent | delivery_delayed | delivered | opened | bounced | complained
  -- Precedence is enforced in app code (lib/outboundEmailLog.ts): bounced /
  -- complained are terminal; delivered/opened never downgrade them.
  status           text not null default 'sent',
  last_event_at    timestamptz,
  bounce_reason    text,
  created_at       timestamptz not null default now()
);

create index if not exists outbound_email_log_cert_request_idx
  on outbound_email_log (cert_request_id);
create index if not exists outbound_email_log_cert_number_idx
  on outbound_email_log (cert_number);
create index if not exists outbound_email_log_client_idx
  on outbound_email_log (client_id);

-- Service-role only (RLS on, no policies) — same posture as inbound_email_log.
alter table outbound_email_log enable row level security;
