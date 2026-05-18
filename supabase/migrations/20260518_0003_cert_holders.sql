-- Saved certificate holders for autocomplete.
-- Populated automatically when a client successfully submits a cert request.
-- Unique per (client_id, name, address1) — use_count and last_used_at increment on re-use.

CREATE TABLE IF NOT EXISTS cert_holders (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid        NOT NULL REFERENCES coi_clients(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  address1     text        NOT NULL,
  address2     text        NOT NULL DEFAULT '',
  use_count    integer     NOT NULL DEFAULT 1,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (client_id, name, address1)
);

ALTER TABLE cert_holders ENABLE ROW LEVEL SECURITY;

-- Clients can read their own saved holders (used for autocomplete).
CREATE POLICY "cert_holders_self_select"
  ON cert_holders FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT id FROM coi_clients
      WHERE contact_email = (auth.jwt() ->> 'email')
    )
  );

-- All writes happen server-side via service-role; no client write policy needed.

CREATE INDEX idx_cert_holders_client_last_used
  ON cert_holders (client_id, last_used_at DESC);
