-- Renewal events as state (was: fire-and-forget warning emails only).
--
-- One row per detected policy renewal — whether the dates were updated in
-- place (update-policy) or a fresh policy row arrived via dec-page import
-- (save-policy). Records what the automation did about it: how many live
-- certs were rolled through the trust ladder, how many failed, how many
-- were in flight and skipped.

create table if not exists renewals (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references coi_clients(id) on delete restrict,
  policy_id           uuid not null references policies(id) on delete cascade,
  previous_policy_id  uuid references policies(id) on delete set null,
  old_exp_date        date,
  new_exp_date        date not null,
  renewed_by_email    text,
  reissued            int not null default 0,
  failed              int not null default 0,
  skipped_in_flight   int not null default 0,
  -- detected | processed | reissue_partial | reissue_failed
  status              text not null default 'detected',
  created_at          timestamptz not null default now()
);

create index if not exists renewals_client_idx on renewals (client_id);
create index if not exists renewals_policy_idx on renewals (policy_id);

alter table renewals enable row level security;
