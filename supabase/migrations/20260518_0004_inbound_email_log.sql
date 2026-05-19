-- Audit + idempotency log for inbound COI request emails.
-- Each inbound webhook delivery from Resend (or any inbound provider) gets a row.
-- Dedup on RFC822 Message-ID so provider retries don't generate duplicate certs.

CREATE TABLE IF NOT EXISTS inbound_email_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      text        NOT NULL UNIQUE,
  from_address    text        NOT NULL,
  to_address      text,
  subject         text,
  in_reply_to     text,
  references_hdr  text,
  intent          text,                -- 'new_request' | 'followup_info' | 'error_report' | 'other' | null pre-classify
  status          text        NOT NULL,-- 'received' | 'replied_ok' | 'replied_missing' | 'no_client_match' | 'error_report_escalated' | 'reviewer_flagged_escalated' | 'error' | 'duplicate'
  client_id       uuid        REFERENCES coi_clients(id) ON DELETE SET NULL,
  cert_request_id uuid        REFERENCES cert_requests(id) ON DELETE SET NULL,
  cert_number     text,
  parse_json      jsonb,
  error           text,
  received_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inbound_email_log ENABLE ROW LEVEL SECURITY;
-- All writes happen server-side via service-role; no client policies needed.

CREATE INDEX idx_inbound_email_log_received_at
  ON inbound_email_log (received_at DESC);

CREATE INDEX idx_inbound_email_log_client_id
  ON inbound_email_log (client_id, received_at DESC);

CREATE INDEX idx_inbound_email_log_cert_number
  ON inbound_email_log (cert_number);
