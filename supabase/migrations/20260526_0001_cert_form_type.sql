-- =============================================================================
-- COI Portal — Multi-form support, Step 1 of 3: tag certs with their form_type
-- Project: The Policy Place (Brook, owner)
--
-- Today every cert_requests row is implicitly an ACORD 25. As we add more
-- forms (ACORD 27, 28, 125, etc.), each cert needs to declare which template
-- it was rendered against — both for the rendering pipeline (which coords to
-- use) and for downstream reporting ("how many of each form did we issue?").
--
-- Backward-compatibility:
--   - Default is 'ACORD_25', so every existing row backfills automatically.
--   - The default also means the API still works without code changes — the
--     form_type just gets implicitly set to ACORD_25.
--   - When form_templates registry (migration _0003) is in place, a FK can be
--     added; we don't add it here so this migration can apply standalone.
-- =============================================================================

alter table cert_requests
  add column form_type text not null default 'ACORD_25';

comment on column cert_requests.form_type is
  'Identifier of the form template used to render this cert (e.g. ACORD_25, ACORD_27). Joins to form_templates.id once that table exists.';

-- Filter the admin queue by form type ("show me all pending ACORD 27s").
-- Partial index on pending status keeps it cheap; the queue view dominates reads.
create index cert_requests_form_type_idx
  on cert_requests (form_type, status, created_at desc);
