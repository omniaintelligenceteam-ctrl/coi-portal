-- =============================================================================
-- D2 backfill correction (checksum-suffix regex)
-- =============================================================================
-- The original D2 backfill (supabase/migrations/_proposals/D2_cert_number_allocator.sql)
-- used the regex `^PP-\d{8}-\d{4}$` and `substring(cert_number from 13)::int`.
-- Neither handles the tamper-evident 3-char checksum suffix added by
-- lib/issueCert.ts::withChecksum (cert numbers are stored as
-- `PP-YYYYMMDD-NNNN-XXX`). On a day that already had checksum certs in
-- cert_requests, the backfill computed last_seq from ONLY the legacy
-- non-checksum rows. The next allocate_cert_number RPC then handed out a
-- sequence number that — once the checksum was appended — deterministically
-- collided with an existing row, producing
-- `duplicate key value violates unique constraint "cert_requests_cert_number_key"`.
--
-- This migration re-runs the backfill with a regex that accepts the optional
-- checksum suffix and pins the substring window to positions 12-15 so the
-- int cast succeeds for both shapes. Idempotent.
-- =============================================================================

insert into cert_number_seq (date_key, prefix, last_seq)
select
  substring(cert_number from 4 for 8) as date_key,
  'PP-' as prefix,
  max(substring(cert_number from 12 for 4)::int) as last_seq
from cert_requests
where cert_number ~ '^PP-\d{8}-\d{4}(-[A-Z0-9]{3})?$'
group by 1
on conflict (date_key) do update
  set last_seq = greatest(cert_number_seq.last_seq, excluded.last_seq),
      updated_at = now();
