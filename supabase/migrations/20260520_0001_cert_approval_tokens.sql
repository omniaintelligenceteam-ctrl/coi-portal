-- =============================================================================
-- COI Portal — signed single-use approval tokens for the admin email link
-- Added 2026-05-20. Solves the "Brook taps the approval email on her phone and
-- gets bounced to /login" problem by embedding a per-admin, per-request HMAC
-- token in the email URL. The token is the proof of identity AND the proof of
-- authorization for one specific cert_request — no session cookie required.
--
-- Plan: ~/.claude/plans/jazzy-questing-squirrel.md (approved 2026-05-20)
-- =============================================================================

create table cert_approval_tokens (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null references cert_requests(id) on delete cascade,
  admin_email      text not null,
  -- SHA-256 hex of the raw token. Raw token is in the email URL ONLY — never
  -- stored anywhere. A DB leak alone cannot forge an approval link.
  token_hash       text not null unique,
  expires_at       timestamptz not null,
  -- Single-use: set the moment Brook taps Approve/Reject. Atomic
  -- UPDATE ... WHERE consumed_at IS NULL RETURNING id is the race guard.
  consumed_at      timestamptz,
  consumed_action  text check (consumed_action in ('approve','reject') or consumed_action is null),
  consumed_ip      inet,
  consumed_ua      text,
  created_at       timestamptz not null default now()
);

create index cert_approval_tokens_request_idx     on cert_approval_tokens (request_id);
create index cert_approval_tokens_token_hash_idx  on cert_approval_tokens (token_hash);

comment on table cert_approval_tokens is
  'Per-admin, per-cert-request approval tokens delivered in the queue notification email. Token in email URL is hashed to token_hash; raw token is never persisted. Single-use, short TTL, scoped to one request and one action.';

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Lock down completely — only service role reads/writes these rows.
-- The approval landing page uses createAdminClient() (service role), bypassing
-- RLS. Clients and unauthenticated requests have no visibility.
-- =============================================================================

alter table cert_approval_tokens enable row level security;
-- No policies = nobody reads or writes except service role.
