-- =============================================================================
-- COI Portal — confidence-scored graduated auto-approval
-- =============================================================================
-- The reviewer agent already does pass/flag analysis. This migration adds the
-- machinery to make Brook a safety net rather than a bottleneck:
--
--   1. Reviewer emits a 0-100 confidence score + short reasoning string
--   2. Each client has thresholds (low / high) for trust-ladder routing
--   3. Each cert_request lands in one of three lanes:
--        manual    — confidence < low OR auto_approve_enabled = false
--                    Brook reviews via the queue (today's behavior)
--        holdback  — low ≤ confidence < high
--                    1h delay before auto-approve. Brook can intercept.
--        instant   — confidence ≥ high
--                    Auto-approve + send immediately, no human in the loop.
--   4. Holdback releases run via cron every 5 minutes
--
-- Migration safety: All new columns are nullable / have defaults. Existing
-- rows continue to render. The cron job is a no-op until a row has
-- auto_approve_lane = 'holdback'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cert_requests: confidence + lane + holdback machinery
-- -----------------------------------------------------------------------------
alter table cert_requests
  add column confidence_score       int,
  add column confidence_reasoning   text,
  add column auto_approve_lane      text,
  add column holdback_until         timestamptz,
  add column intercepted_at         timestamptz,
  add column intercepted_by_email   text;

comment on column cert_requests.confidence_score is
  '0-100 score emitted by the reviewer agent. Null = reviewer did not run / failed. Drives the auto_approve_lane decision against the client''s thresholds.';
comment on column cert_requests.confidence_reasoning is
  'Short LLM-authored explanation of why the score landed where it did. Surfaced in the admin queue card and the /status timeline.';
comment on column cert_requests.auto_approve_lane is
  '''manual'' (queue for Brook), ''holdback'' (1h delay before auto-send, Brook can intercept), or ''instant'' (auto-send immediately). Null only during initial pending state before reviewer runs.';
comment on column cert_requests.holdback_until is
  'When set + lane=''holdback'' + status=''reviewed'', the cron at /api/cron/holdback-release flips the row to approved and sends. Brook can intercept by hitting /api/admin/intercept-cert before this timestamp.';
comment on column cert_requests.intercepted_at is
  'Set when Brook hits the intercept endpoint during a holdback window. Clears the lane and freezes the row at status=''reviewed'' for manual decision.';

alter table cert_requests
  add constraint cert_requests_confidence_range
  check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 100));

alter table cert_requests
  add constraint cert_requests_lane_valid
  check (auto_approve_lane is null or auto_approve_lane in ('manual', 'holdback', 'instant'));

-- Partial index for the cron sweep — only rows that might be due for release.
create index cert_requests_holdback_due_idx
  on cert_requests (holdback_until)
  where status = 'reviewed'
    and auto_approve_lane = 'holdback'
    and holdback_until is not null
    and intercepted_at is null;

-- -----------------------------------------------------------------------------
-- coi_clients: per-client thresholds
-- -----------------------------------------------------------------------------
-- Defaults match the product decision (70 / 90 with per-client graduation).
-- Brook can tune per-client from the settings UI.
alter table coi_clients
  add column auto_approve_threshold_low  int not null default 70,
  add column auto_approve_threshold_high int not null default 90;

comment on column coi_clients.auto_approve_threshold_low is
  'Minimum confidence for the holdback lane (1h delay before auto-send). Below this and auto-approve is on, still routes to Brook. Range 0-100. Default 70.';
comment on column coi_clients.auto_approve_threshold_high is
  'Minimum confidence for the instant lane (no human in the loop). Range 0-100. Default 90.';

alter table coi_clients
  add constraint coi_clients_threshold_valid
  check (
    auto_approve_threshold_low >= 0 and auto_approve_threshold_low <= 100
    and auto_approve_threshold_high >= 0 and auto_approve_threshold_high <= 100
    and auto_approve_threshold_low <= auto_approve_threshold_high
  );
