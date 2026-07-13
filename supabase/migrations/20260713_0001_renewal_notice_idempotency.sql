-- Renewal-notice idempotency markers.
--
-- The policy-renewals cron matches exp_date in a 3-day window and runs daily,
-- so without a sent-record every policy received the same warning on up to
-- three consecutive days (and any cron retry re-sent it again). These
-- timestamps record that the 30-day / 7-day notice went out; the cron skips
-- rows whose marker is already set. The window stays 3 days wide so a missed
-- cron run still catches the policy the next day.

alter table policies
  add column if not exists renewal_30_notified_at timestamptz,
  add column if not exists renewal_7_notified_at  timestamptz;

comment on column policies.renewal_30_notified_at is
  'When the ~30-day expiry warning email was sent (cron idempotency marker).';
comment on column policies.renewal_7_notified_at is
  'When the ~7-day expiry warning email was sent (cron idempotency marker).';
