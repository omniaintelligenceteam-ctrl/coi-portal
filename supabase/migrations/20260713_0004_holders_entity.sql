-- Holders as a first-class entity (Holder CRM).
--
-- Until now a certificate holder existed only as denormalized strings on
-- cert_requests plus the cert_holders autocomplete cache. This table gives
-- each (client, holder) pair a real record: contact info for direct
-- delivery, notes, and — next migration — coverage requirements for the
-- deterministic requirements engine.
--
-- cert_holders (the autocomplete cache) stays as-is for now; issueCert keeps
-- feeding it. Consolidation can come later without breaking either surface.

create table if not exists holders (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references coi_clients(id) on delete cascade,
  name           text not null,
  address1       text not null default '',
  address2       text,
  contact_email  text,
  phone          text,
  notes          text,
  -- Structured coverage requirements consumed by lib/requirementsCheck.ts
  -- (deterministic requested-vs-carried gate). Shape is Zod-validated in app
  -- code; null = no requirements on file.
  requirements   jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One holder record per client + normalized name/address pair.
create unique index if not exists holders_client_name_addr_key
  on holders (client_id, lower(name), lower(address1));

create index if not exists holders_client_idx on holders (client_id);

alter table holders enable row level security;

-- Link cert_requests to the holder entity. Nullable: legacy rows + rows
-- whose backfill key didn't match stay unlinked (strings remain canonical
-- on the cert row itself — the PDF renders from the strings, always).
alter table cert_requests
  add column if not exists holder_id uuid references holders(id) on delete set null;

create index if not exists cert_requests_holder_idx on cert_requests (holder_id);

-- Backfill: create a holder per distinct (client, name, address1) seen on
-- cert_requests, then link the requests. Safe to re-run.
insert into holders (client_id, name, address1, address2)
select distinct on (client_id, lower(holder_name), lower(holder_address1))
  client_id, holder_name, holder_address1, holder_address2
from cert_requests
where client_id is not null
order by client_id, lower(holder_name), lower(holder_address1), requested_at desc
on conflict (client_id, lower(name), lower(address1)) do nothing;

update cert_requests cr
set holder_id = h.id
from holders h
where cr.holder_id is null
  and h.client_id = cr.client_id
  and lower(h.name) = lower(cr.holder_name)
  and lower(h.address1) = lower(cr.holder_address1);

-- updated_at maintenance (same trigger pattern as form_templates).
create or replace function set_holders_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists holders_updated_at on holders;
create trigger holders_updated_at
  before update on holders
  for each row execute function set_holders_updated_at();
