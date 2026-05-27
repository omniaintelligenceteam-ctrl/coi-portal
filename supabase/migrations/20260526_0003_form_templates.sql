-- =============================================================================
-- COI Portal — Multi-form support, Step 3 of 3: form_templates registry
-- Project: The Policy Place (Brook, owner)
--
-- The registry of every insurance form the portal knows how to render.
-- The code-side registry in lib/forms/registry.ts is the authoritative source
-- for HOW to render a form (coords, fill logic, validators). This table
-- mirrors the metadata so:
--   - DB queries can join cert_requests.form_type to a human display name
--   - Admin UI can list "active" forms without parsing TS source
--   - Reporting can group by form revision
--   - We can soft-deactivate a form (active = false) without deleting code
--
-- The seed row keeps the existing ACORD 25 wired without any code change —
-- the registry table is consistent with lib/forms/registry.ts from day one.
-- =============================================================================

create table form_templates (
  id                   text primary key,                 -- 'ACORD_25', 'ACORD_27', ...
  display_name         text not null,                    -- 'Certificate of Liability Insurance'
  revision             text not null,                    -- '2016/03'
  template_pdf_path    text not null,                    -- relative path under repo root
  template_png_path    text not null,                    -- rasterized page-1 PNG for overlay
  source_pdf_sha256    text not null,                    -- tamper-detect; matches lib/anchors.ts lock
  insurer_slot_count   integer not null default 6,       -- ACORD 25 has 6 (A-F); others vary
  active               boolean not null default true,    -- false hides from admin UI without deleting
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table form_templates is
  'Registry of insurance form templates the portal can render. Mirrors lib/forms/registry.ts on the DB side so cert_requests.form_type has a join target and the admin UI can list active forms without parsing TS.';

comment on column form_templates.source_pdf_sha256 is
  'SHA256 of the blank ACORD-issued template PDF. Cert-doctor verifies this matches the anchors JSON on every run — if ACORD ships a revision, this will mismatch and the form is taken offline until coords are re-tuned.';

comment on column form_templates.insurer_slot_count is
  'How many insurer rows the form has (ACORD 25 = 6, named A-F). Used by lib/coiInputBuilder to validate insurer assignment.';

comment on column form_templates.active is
  'Soft-deactivation: set false to hide the form from admin UI and block new cert_requests without dropping the row or breaking history.';

-- Auto-update updated_at on any change (mirrors the pattern used on coi_clients).
create or replace function form_templates_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger form_templates_updated_at
  before update on form_templates
  for each row execute function form_templates_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: admin-only read/write. Clients never touch this table.
-- -----------------------------------------------------------------------------
alter table form_templates enable row level security;

-- Service-role bypasses RLS automatically; admin reads happen via service-role
-- in the API layer. No client-facing policy needed.

-- -----------------------------------------------------------------------------
-- Seed: ACORD 25 (the only form supported as of this migration)
-- -----------------------------------------------------------------------------
-- The SHA256 here matches lib/anchors.ts's source_sha256 lock as of 2026-05-18.
-- If the template PDF is ever regenerated, both this row and template-anchors.json
-- must be updated in the same commit.
insert into form_templates (
  id, display_name, revision,
  template_pdf_path, template_png_path,
  source_pdf_sha256, insurer_slot_count, active
) values (
  'ACORD_25',
  'Certificate of Liability Insurance',
  '2016/03',
  'assets/acord-25-template.pdf',
  'assets/template/acord-25-page-1.png',
  '4939e86f690d93ef5fa396249eea1799843f9eafae905e629293e0ab07eef110',
  6,
  true
);
