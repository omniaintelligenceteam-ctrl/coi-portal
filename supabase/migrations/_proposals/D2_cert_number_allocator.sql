-- =============================================================================
-- D2 PROPOSAL — Atomic cert_number allocator (race-condition fix)
-- Status: DRAFT, not applied. Review before promoting to active migration.
-- =============================================================================
-- PROBLEM: lib/coiInputBuilder.ts → computeNextCertNumber does a read-then-write
-- on MAX(cert_number) WHERE date=today. Two concurrent submits both compute
-- the same number, both render PDFs, both upsert to the same storage path
-- (clobbering each other), then only one INSERT succeeds because of the
-- UNIQUE constraint on cert_number — but the loser's PDF has already
-- overwritten the winner's in storage.
--
-- FIX: Atomic allocation via a counter table + locked UPDATE. Allocation
-- runs in its own transaction; if it succeeds, the caller has a unique
-- cert_number BEFORE rendering/uploading anything.
--
-- Required app-code change: lib/coiInputBuilder.ts must call this RPC
-- instead of `select max(cert_number)`. See companion patch.
-- =============================================================================

create table if not exists cert_number_seq (
  date_key   text  primary key,        -- 'YYYYMMDD'
  prefix     text  not null,           -- 'PP-' (per-tenant in future)
  last_seq   int   not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function allocate_cert_number(p_prefix text default 'PP-')
returns text
language plpgsql
as $$
declare
  v_today text := to_char(now() at time zone 'UTC', 'YYYYMMDD');
  v_next  int;
  v_cert  text;
begin
  insert into cert_number_seq (date_key, prefix, last_seq)
    values (v_today, p_prefix, 1)
    on conflict (date_key) do update
      set last_seq = cert_number_seq.last_seq + 1,
          updated_at = now()
    returning last_seq into v_next;

  -- Format: PP-YYYYMMDD-NNNN (4-digit zero-padded; supports 9999/day)
  v_cert := p_prefix || v_today || '-' || lpad(v_next::text, 4, '0');
  return v_cert;
end;
$$;

-- Optional housekeeping: prune seq rows older than 90 days (keeps table small).
-- Run manually or via pg_cron once the table grows.
-- delete from cert_number_seq where updated_at < now() - interval '90 days';

-- Backfill from existing cert_requests so the sequence doesn't regress on
-- the day of deploy. Safe to run multiple times.
--
-- IMPORTANT: cert_number values may carry an optional 3-char checksum suffix
-- (`PP-YYYYMMDD-NNNN-XXX`) added by lib/issueCert.ts::withChecksum. The
-- original regex `^PP-\d{8}-\d{4}$` missed those rows, which on a day with
-- mixed legacy + checksummed certs caused last_seq to lag behind reality and
-- the next RPC allocation to collide with an existing checksum row. The
-- regex below accepts both shapes, and the substring window is pinned to
-- positions 12-15 so the cast works either way. Fixed in companion migration
-- 20260519_0001_d2_backfill_fix_checksum_suffix.
insert into cert_number_seq (date_key, prefix, last_seq)
select
  substring(cert_number from 4 for 8) as date_key,
  'PP-' as prefix,
  max(substring(cert_number from 12 for 4)::int) as last_seq
from cert_requests
where cert_number ~ '^PP-\d{8}-\d{4}(-[A-Z0-9]{3})?$'
group by 1
on conflict (date_key) do update
  set last_seq = greatest(cert_number_seq.last_seq, excluded.last_seq);

grant execute on function allocate_cert_number(text) to service_role;
