-- =============================================================================
-- COI Portal — full-field cert edit, coverage lifecycle, void, master certs
-- Project: The Policy Place (Brook, owner)
--
-- Adds the schema needed for:
--   1. Editing ANY cert field before approval (cert_requests.cert_overrides)
--   2. Coverage cancellation as a real lifecycle (policies.status)
--   3. Voiding sent certs as a real status, not a deletion (cert_request_status)
--   4. Master certificates (cert_requests.is_master)
--
-- See plan: ~/.claude/plans/valiant-foraging-swing.md
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Coverage lifecycle on policies
-- -----------------------------------------------------------------------------
-- Until now, `policies.active` doubled as a soft-delete AND a "still in force"
-- signal. Brook needs a real cancellation flag so she can mark a coverage dead
-- mid-term and have the portal stop offering it. We keep `active` (admin
-- soft-delete) and add `status` for the public coverage lifecycle.

create type coverage_status as enum ('active', 'cancelled', 'expired');

alter table policies
  add column status            coverage_status not null default 'active',
  add column cancelled_at      timestamptz,
  add column cancelled_reason  text;

-- A row marked cancelled MUST have a timestamp. Anything else is a data bug.
alter table policies
  add constraint policies_cancelled_consistency
  check ((status = 'cancelled') = (cancelled_at is not null));

create index policies_status_idx on policies (client_id, status);

comment on column policies.status is
  'Public coverage lifecycle. Distinct from `active` (admin soft-delete). active=in force, cancelled=killed mid-term, expired=past exp_date. Filtered to active before showing to clients.';

-- One-shot backfill: anything currently inactive on the books is treated as
-- expired (closest existing semantic). Cancellations going forward use the
-- new column. Postgres requires an explicit cast when assigning a text
-- literal to an enum-typed column inside a CASE expression.
update policies
   set status = case
     when active then 'active'::coverage_status
     else 'expired'::coverage_status
   end;

-- -----------------------------------------------------------------------------
-- cert_requests: cert-level overrides + master flag + void lifecycle
-- -----------------------------------------------------------------------------
-- cert_overrides is the snapshot of what Brook wants printed on THIS cert,
-- merged over the DB-derived CoiInput at render time. Never mutates `policies`
-- or `coi_clients`. Keeps `edited_diff` for backward-compatible audit.

alter table cert_requests
  add column cert_overrides    jsonb not null default '{}'::jsonb,
  add column is_master         boolean not null default false,
  add column voided_at         timestamptz,
  add column voided_reason     text,
  add column voided_by_email   text;

comment on column cert_requests.cert_overrides is
  'Snapshot of admin-edited cert fields. Schema mirrors lib/types.ts:CertOverrides. Merged over DB-derived CoiInput by applyCertOverrides() at render time. Empty object = no overrides, render from raw DB rows.';
comment on column cert_requests.is_master is
  'True when the insured is also the certificate holder (client self-issued for their own records).';

-- 'voided' is a terminal state for a cert that was already sent and later
-- pulled back. Distinct from 'rejected' (never sent). The enum supports it via
-- ALTER TYPE; the existing enum is named cert_request_status (see migration
-- 20260518_0002_approval_workflow.sql).
alter type cert_request_status add value if not exists 'voided';

-- A voided cert MUST have a timestamp + reason captured.
-- Postgres refuses to reference a newly-added enum value inside the same
-- transaction that added it. The text-cast on both sides sidesteps the
-- enum-resolution check; semantics are unchanged because 'voided' is a
-- stable label that Postgres will read back as text from the enum.
alter table cert_requests
  add constraint cert_requests_voided_consistency
  check ((status::text = 'voided') = (voided_at is not null));

-- -----------------------------------------------------------------------------
-- Affected-cert sweep helper
-- -----------------------------------------------------------------------------
-- When Brook cancels a coverage, we need to surface every live cert that
-- referenced it so she can decide which to void. coverages_selected is a
-- jsonb array of policy_id strings (set by lib/issueCert.ts:263). This view
-- flattens that array to one row per cert × policy combo so the affected-cert
-- sweep becomes a simple WHERE clause.

create view cert_requests_active_policies
  with (security_invoker = true) as
  select
    cr.id                          as request_id,
    cr.client_id,
    cr.cert_number,
    cr.holder_name,
    cr.status,
    cr.sent_at,
    cr.requested_at,
    elem.value #>> '{}'            as policy_id
  from cert_requests cr
  cross join lateral jsonb_array_elements(cr.coverages_selected) as elem(value)
  where cr.status in ('sent', 'approved', 'edited');

comment on view cert_requests_active_policies is
  'One row per (live cert × selected policy). Used by lib/affectedCerts.ts to find certs that need voiding after a coverage cancellation. Runs as security_invoker so it inherits cert_requests RLS rather than bypassing it.';
