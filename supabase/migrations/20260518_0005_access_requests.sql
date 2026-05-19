-- =============================================================================
-- COI Portal — access requests (self-signup + admin invites)
-- Added 2026-05-18.
--
-- Anyone can request access via /signup. Wes + Brook get an email, approve in
-- /admin/access-requests, which creates a coi_clients row. Admins can also
-- proactively invite a client (creates the same row directly + emails them).
-- =============================================================================

create type access_request_status as enum (
  'pending',     -- submitted by user, awaiting Wes/Brook
  'approved',    -- approved, coi_clients row created and user emailed
  'rejected'     -- declined, user emailed reason
);

create type access_request_source as enum (
  'self_signup', -- user submitted /signup
  'admin_invite' -- Brook/Wes proactively added them
);

create table access_requests (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  business_name      text not null,
  contact_name       text,
  phone              text,
  message            text,
  source             access_request_source not null default 'self_signup',
  status             access_request_status not null default 'pending',
  requested_at       timestamptz not null default now(),
  requested_ip       inet,
  decided_by_email   text,
  decided_at         timestamptz,
  decision_note      text,
  linked_client_id   uuid references coi_clients(id) on delete set null
);

create index access_requests_status_idx on access_requests (status, requested_at desc);
create index access_requests_email_idx  on access_requests (lower(email));

comment on table access_requests is
  'Self-signup + invite log. Pending rows show in /admin/access-requests. Approval creates a coi_clients row and sets linked_client_id. RLS denies all client access — service role only.';

alter table access_requests enable row level security;
-- No policies — only service role reads/writes (signup API + admin actions).
