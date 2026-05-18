-- =============================================================================
-- COI Portal — initial schema
-- Project: The Policy Place self-serve Certificate of Insurance portal
-- Multi-tenant from day 1 via agency_id (future white-label ready)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type policy_type as enum ('GL','WC','AUTO','UMBRELLA','EQUIPMENT','OTHER');

-- -----------------------------------------------------------------------------
-- agencies
-- -----------------------------------------------------------------------------
create table agencies (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  address1                 text,
  address2                 text,
  contact_name             text,
  phone                    text,
  fax                      text,
  email                    text,
  signature_png_path       text,
  signature_consent_text   text,
  signature_consent_at     timestamptz,
  license_no               text,
  created_at               timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  agency_id           uuid not null references agencies(id) on delete cascade,
  business_name       text not null,
  business_address1   text,
  business_address2   text,
  contact_email       text not null unique,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create index clients_contact_email_idx on clients (contact_email);

-- -----------------------------------------------------------------------------
-- insurers
-- -----------------------------------------------------------------------------
create table insurers (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  naic  text not null
);

create unique index insurers_naic_uidx on insurers (naic);

-- -----------------------------------------------------------------------------
-- policies
-- -----------------------------------------------------------------------------
create table policies (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  type                     policy_type not null,
  insurer_id               uuid not null references insurers(id),
  policy_number            text not null,
  eff_date                 date not null,
  exp_date                 date not null,
  limits_jsonb             jsonb not null default '{}'::jsonb,
  addl_insured_blanket     boolean not null default false,
  subrogation_waived       boolean not null default false,
  description              text,
  active                   boolean not null default true,
  created_at               timestamptz not null default now()
);

create index policies_client_id_idx on policies (client_id);
create index policies_exp_date_idx on policies (exp_date);

-- -----------------------------------------------------------------------------
-- coi_audit
-- -----------------------------------------------------------------------------
create table coi_audit (
  id                    uuid primary key default gen_random_uuid(),
  client_id             uuid not null references clients(id) on delete cascade,
  cert_number           text not null unique,
  generated_at          timestamptz not null default now(),
  requested_by_email    text,
  requested_ip          inet,
  holder_name           text,
  holder_address1       text,
  holder_address2       text,
  coverages_selected    jsonb not null default '[]'::jsonb,
  pdf_storage_path      text
);

create index coi_audit_client_generated_idx on coi_audit (client_id, generated_at desc);

-- =============================================================================
-- Row-Level Security
-- =============================================================================
-- Strategy: end-users (clients) auth via Supabase magic-link. Their JWT carries
-- their email. RLS scopes every client-data row to that email.
-- Service role (server endpoints / cron) bypasses RLS by default in Supabase.
-- =============================================================================

alter table clients   enable row level security;
alter table policies  enable row level security;
alter table coi_audit enable row level security;

-- clients: row visible only when its contact_email = auth.email()
create policy "clients_self_select"
  on clients
  for select
  using (contact_email = auth.email());

-- policies: visible when joined client.contact_email = auth.email()
create policy "policies_self_select"
  on policies
  for select
  using (
    exists (
      select 1 from clients c
      where c.id = policies.client_id
        and c.contact_email = auth.email()
    )
  );

-- coi_audit: visible when joined client.contact_email = auth.email()
-- (clients see their own history; server inserts via service role)
create policy "coi_audit_self_select"
  on coi_audit
  for select
  using (
    exists (
      select 1 from clients c
      where c.id = coi_audit.client_id
        and c.contact_email = auth.email()
    )
  );

-- Note: no INSERT/UPDATE/DELETE policies on these tables.
-- Writes happen via service-role on server endpoints, which bypass RLS.
-- agencies + insurers are reference data; we leave RLS off so authenticated
-- clients can read agency branding + insurer names for COI rendering.
