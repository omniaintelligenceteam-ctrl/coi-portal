-- =============================================================================
-- COI Portal — Client profile expansion + audit trail
-- Project: The Policy Place (Brook, owner)
--
-- Phase 1 of the world-class plan: make every editable client field a real
-- first-class column, soft-archive via timestamp, and record every change in
-- a tamper-evident audit log so Brook can answer "who edited this and when".
--
-- Scope:
--   1. coi_clients gains contact_name, phone, archived_at, archived_reason
--   2. client_audit_log captures field-level diffs for any profile change
--   3. RLS: audit log is admin-only (service-role writes, no client visibility)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- coi_clients: contact_name, phone, soft archive
-- -----------------------------------------------------------------------------
-- contact_name: the human at the insured business who receives certs and
-- (eventually) signs in to self-serve. Distinct from agencies.contact_name,
-- which is the agency's own producer contact (Brook's side of the line).
--
-- phone: the insured's phone — useful when Brook needs to reach the client
-- about a policy renewal or a cert request she's not sure about.
--
-- archived_at: soft archive, not hard delete. A client may need to come back
-- (sold business, took a year off, etc.) and we never want their cert history
-- to vanish. archived clients are hidden from the active list but everything
-- they ever did is preserved.
alter table coi_clients
  add column contact_name      text,
  add column phone             text,
  add column archived_at       timestamptz,
  add column archived_reason   text;

comment on column coi_clients.contact_name is
  'Primary contact at the insured business — the human who receives certs and self-serves on the portal.';
comment on column coi_clients.phone is
  'Insured business phone. Optional — useful for renewal outreach.';
comment on column coi_clients.archived_at is
  'Soft-archive timestamp. NULL = active. Set when admin archives the client. Hard-delete is never used so cert history is preserved.';

-- An archived row must have a timestamp. Anything else is a data bug.
-- (Mirrors the policies_cancelled_consistency pattern from migration _0002.)
alter table coi_clients
  add constraint coi_clients_archived_consistency
  check ((archived_at is null) or (archived_at is not null and active = false));

-- Partial index for the active-client roster queries (the dominant read path).
create index coi_clients_active_idx on coi_clients (agency_id, business_name) where archived_at is null;

-- -----------------------------------------------------------------------------
-- client_audit_log: tamper-evident change history
-- -----------------------------------------------------------------------------
-- One row per write that touched a client's profile fields. Stores the diff
-- (before/after per field) plus actor + timestamp + IP. Reads are admin-only;
-- writes happen via service-role from the update-client API route.
--
-- Why a separate table instead of versioned rows on coi_clients?
--   - The dominant read is "show me current client" — cheaper to keep that row
--     thin and look up history on demand.
--   - Audit rows are append-only and never updated, so they can live with
--     different indexes and a different retention story than the main table.
--   - Diff-as-jsonb (rather than full row snapshots) keeps storage small and
--     makes "what changed" trivially queryable.
create table client_audit_log (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references coi_clients(id) on delete cascade,
  action          text not null,                          -- 'updated' | 'archived' | 'restored' | 'transferred'
  actor_email     text not null,                          -- who did it (must be in ADMIN_EMAILS)
  actor_ip        inet,
  diff            jsonb not null default '{}'::jsonb,    -- {field: {from, to}} — empty for archive/restore
  note            text,                                   -- optional free-text (e.g. archive reason)
  created_at      timestamptz not null default now()
);

create index client_audit_log_client_idx on client_audit_log (client_id, created_at desc);
create index client_audit_log_actor_idx  on client_audit_log (actor_email, created_at desc);

comment on table client_audit_log is
  'Append-only change history for coi_clients profile edits. Service-role writes only — never updated, never client-visible. Used by the admin client hub Audit tab to show "who changed what and when".';

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
-- client_audit_log has RLS enabled with no policies — service-role only.
-- Mirrors the client_overrides pattern from migration _0002.
alter table client_audit_log enable row level security;
