-- =============================================================================
-- COI Portal — approval workflow + reviewer agent + feedback memory
-- Added 2026-05-18 after architectural pivot from direct-generate to
-- approval-first flow (Wes/Brook). Solves two problems at once:
--   1) ACORD "prohibited use" portal clause — Brook is the actor of record
--      on every cert, so the form is "agent-issued" not "client-generated"
--   2) E&O hardening — Brook reviews everything until she trusts the system,
--      then can opt-in to auto-approve per-client
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type cert_request_status as enum (
  'pending',     -- client submitted, awaiting reviewer + Brook
  'reviewed',    -- reviewer agent ran, awaiting Brook
  'approved',    -- Brook approved as-is
  'edited',      -- Brook edited values + approved
  'rejected',    -- Brook declined (client gets follow-up email)
  'sent'         -- terminal: PDF emailed, audit row inserted
);

create type override_scope as enum (
  'holder',      -- holder-name/address overrides for this client
  'coverage',    -- coverage-specific notes (e.g. always include WOS for this client)
  'general'      -- everything else
);

-- -----------------------------------------------------------------------------
-- coi_clients: add auto-approve toggle
-- -----------------------------------------------------------------------------
alter table coi_clients
  add column auto_approve_enabled boolean not null default false;

comment on column coi_clients.auto_approve_enabled is
  'When true, cert requests skip Brook''s approval queue and send after reviewer pass. Must remain false until Brook has watched the client''s certs for a stretch and trusts them.';

-- -----------------------------------------------------------------------------
-- cert_requests: the approval queue
-- -----------------------------------------------------------------------------
create table cert_requests (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references coi_clients(id) on delete cascade,
  agency_id             uuid not null references agencies(id) on delete cascade,

  -- snapshot of what the client requested
  holder_name           text not null,
  holder_address1       text not null,
  holder_address2       text,
  coverages_selected    jsonb not null,         -- array of policy ids

  -- rendered output (always produced, gated on send)
  cert_number           text not null unique,    -- PP-YYYYMMDD-XXXX, reserved at request time
  pdf_storage_path      text,                    -- supabase storage path once rendered

  -- reviewer agent output
  reviewer_pass         boolean,                  -- null until reviewer runs
  reviewer_flags        jsonb not null default '[]'::jsonb,    -- [{field, severity, message}]
  reviewer_notes        text,                     -- free-text summary
  reviewer_model        text,                     -- e.g. 'claude-sonnet-4-6'
  reviewed_at           timestamptz,

  -- workflow state
  status                cert_request_status not null default 'pending',
  requested_by_email    text not null,
  requested_ip          inet,
  requested_at          timestamptz not null default now(),

  -- Brook's decision
  decided_by_email      text,                     -- whoever clicked approve/edit/reject
  decided_at            timestamptz,
  decision_note         text,                     -- optional free-text note

  -- edit trail (if Brook changed values before sending)
  edited_diff           jsonb,                    -- {field: {from, to}} only when status='edited'

  -- terminal
  sent_at               timestamptz
);

create index cert_requests_client_idx       on cert_requests (client_id, requested_at desc);
create index cert_requests_status_idx       on cert_requests (status, requested_at desc);
create index cert_requests_agency_queue_idx on cert_requests (agency_id, status) where status in ('pending','reviewed');

-- -----------------------------------------------------------------------------
-- client_overrides: Brook's institutional memory ("remember this for next time")
-- -----------------------------------------------------------------------------
create table client_overrides (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references coi_clients(id) on delete cascade,
  scope        override_scope not null,
  pattern      text not null,        -- when this situation occurs
  correction   text not null,        -- do this instead
  added_by     text not null,        -- email of the human who added it
  added_at     timestamptz not null default now(),
  active       boolean not null default true,
  source_request_id uuid references cert_requests(id) on delete set null   -- which cert taught us this
);

create index client_overrides_client_idx on client_overrides (client_id, active);

comment on table client_overrides is
  'Brook''s corrections accumulate here. The reviewer agent reads active overrides for the requesting client and feeds them into its prompt. Each override traces back to the cert request that taught the lesson.';

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- cert_requests: client sees own requests (status + decision visible).
-- client_overrides: not exposed to coi_clients at all — Brook-only via service role.
-- =============================================================================

alter table cert_requests     enable row level security;
alter table client_overrides  enable row level security;

create policy "cert_requests_self_select"
  on cert_requests
  for select
  using (
    exists (
      select 1 from coi_clients c
      where c.id = cert_requests.client_id
        and c.contact_email = auth.email()
    )
  );

-- client_overrides has RLS enabled with no policies — nobody sees rows except service role.
-- This is deliberate: Brook's notes are her own ops knowledge, not client-visible.
