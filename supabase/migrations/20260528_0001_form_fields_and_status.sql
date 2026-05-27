-- =============================================================================
-- COI Portal — Visual Form Mapper, Phase 0: form_fields + lifecycle status
-- Project: The Policy Place (Brook, owner)
--
-- Replaces compile-time COORDS (lib/coords.ts) with per-form rows so Brook can
-- author new ACORD forms in the admin UI without an engineering PR.
--
-- form_templates gains:
--   - status        — draft / published / archived
--   - page_count    — multi-page support stub (renderer uses page 1 in V1)
--   - page_width_pt / page_height_pt — PDF page dimensions in points, recorded
--     at upload so the mapper UI can scale anchor overlays correctly
--   - created_by_email — audit trail for who uploaded each form
--   - updated_at    — bumped whenever fields or template are edited
--
-- form_fields is the new table — one row per (form, field) pair, mirroring the
-- shape of the existing COORDS entries so the generic renderer can reuse the
-- battle-tested drawAt / resolveCoord logic without changes. Fields with a
-- recognizable text label use anchor_label + anchor_side + dx/dy; PDFs whose
-- labels can't be extracted (rare) fall back to abs_x / abs_y.
-- =============================================================================

alter table form_templates
  add column status text not null default 'published'
    check (status in ('draft', 'published', 'archived'));

alter table form_templates
  add column page_count integer not null default 1;

alter table form_templates
  add column page_width_pt numeric;

alter table form_templates
  add column page_height_pt numeric;

alter table form_templates
  add column created_by_email text;

-- (updated_at already exists on form_templates as of the 20260526_0003 migration.)

comment on column form_templates.status is
  'Lifecycle: draft (being authored in the mapper), published (live in the registry, available to clients), archived (hidden from new use, historical records remain renderable).';

comment on column form_templates.page_count is
  'Number of pages in the source PDF. V1 renderer uses page 1 only; multi-page is V2.';

comment on column form_templates.created_by_email is
  'Admin email that uploaded the form. Null for forms registered in code before this migration (e.g., ACORD_25).';

-- ACORD_25 was registered in code before this column existed; it's live in prod.
update form_templates
   set status = 'published'
 where id = 'ACORD_25';

-- Per-form field map. Replaces compile-time COORDS in lib/coords.ts.
create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id text not null references form_templates(id) on delete cascade,

  -- Stable key for this field within the form. e.g. 'insured_name', 'gl_policy_number'.
  -- Pulled from lib/forms/fieldDictionary.ts (or 'custom_<n>' for free-form fields).
  field_key text not null,

  -- Which CoiInput path this field renders. Looked up in the field dictionary
  -- to obtain a resolver fn. 'custom' fields store a free-form expression.
  data_source text not null,

  -- Anchor-relative positioning (mirrors lib/coords.ts schema).
  -- For PDFs with no detectable labels, anchor_label is null and we use absolute coords.
  page integer not null default 1 check (page >= 1),
  anchor_label text,
  anchor_side text check (anchor_side in ('right','left','below','above','row','inside')),
  dx numeric not null default 0,
  dy numeric not null default 0,
  abs_x numeric,
  abs_y numeric,

  font_size numeric not null default 7.5 check (font_size > 0),
  max_width_pt numeric check (max_width_pt is null or max_width_pt > 0),
  near_y numeric,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_id, field_key),

  -- Either anchored or absolute, never both, never neither.
  check (
    (anchor_label is not null and anchor_side is not null) or
    (anchor_label is null and abs_x is not null and abs_y is not null)
  )
);

create index form_fields_form_id_idx on form_fields(form_id);

comment on table form_fields is
  'Per-form field map authored via the visual mapper at /admin/forms/<id>/edit. The generic renderer (lib/forms/genericRenderer.ts) walks these rows to overlay text onto the rasterized template PNG.';

-- RLS: admin-only — service role bypasses, no anon/auth access at all.
alter table form_fields enable row level security;
