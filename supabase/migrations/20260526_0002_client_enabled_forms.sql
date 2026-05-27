-- =============================================================================
-- COI Portal — Multi-form support, Step 2 of 3: per-client form enablement
-- Project: The Policy Place (Brook, owner)
--
-- Not every client should be able to issue every form. Brook decides which
-- forms each client is eligible for — typically tied to the policies they
-- have on file. This column drives both the admin generate UI (form picker
-- only shows enabled forms) and the self-service portal (clients can't issue
-- forms they're not enabled for).
--
-- Why a text[] column and not a junction table?
--   - The set is small (a client typically has 1-3 enabled forms, never 50).
--   - We rarely query "which clients have form X enabled?" — and when we do,
--     a GIN index on the array makes it fast.
--   - A junction table would add JOINs to every admin client read path with
--     no real benefit at this cardinality.
--
-- Backward-compatibility:
--   - Default is {ACORD_25}, so every existing client keeps current behavior.
-- =============================================================================

alter table coi_clients
  add column enabled_forms text[] not null default array['ACORD_25']::text[];

comment on column coi_clients.enabled_forms is
  'Which form_types this client is eligible to have issued. Defaults to {ACORD_25}. Edited via the client detail "Forms" tab.';

-- Fast "show me all clients enabled for form X" queries (reporting, bulk ops).
create index coi_clients_enabled_forms_gin
  on coi_clients using gin (enabled_forms);

-- Enablement values must exist in the registry. We can't enforce that as a
-- DB constraint without a JOIN-style check, so the API layer validates on
-- write (lib/forms/registry.ts is the source of truth).
