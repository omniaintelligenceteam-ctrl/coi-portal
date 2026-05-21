-- =============================================================================
-- COI Portal — Master File defaults
-- =============================================================================
-- Brook maintains a per-client "master file" of every COI-relevant field.
-- This migration adds the missing piece: a default description of operations
-- per insured, so the cert request flow doesn't have to ask for it every time
-- (and so the AI agent has a sensible answer to fall back on).
--
-- All Master File policy-level data already lives in existing columns:
--   - policies.limits_jsonb              (numeric limits per coverage type)
--   - policies.addl_insured_blanket      (boolean)
--   - policies.subrogation_waived        (boolean)
--   - policies.description               (free text per-policy)
--   - policies.eff_date / exp_date / policy_number / type / insurer_id
--
-- Per-client auto-approve thresholds already exist from migration _0001.
-- =============================================================================

alter table coi_clients
  add column default_description text;

comment on column coi_clients.default_description is
  'Default description of operations for this insured. Used by the cert pipeline when the request does not specify a per-cert description. Brook edits this on the Master File tab of the client hub.';
