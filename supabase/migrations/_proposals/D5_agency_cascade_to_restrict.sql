-- =============================================================================
-- D5 PROPOSAL — Change agency cascade-deletes to RESTRICT (audit-trail safety)
-- Status: DRAFT, not applied. Review before promoting to active migration.
-- =============================================================================
-- PROBLEM: coi_clients.agency_id (and any other agency-FK columns) is
-- declared ON DELETE CASCADE. A single mis-typed `delete from agencies
-- where id = ...` wipes every coi_clients row, which then cascades to
-- policies, coi_audit, cert_requests, client_overrides, cert_holders.
-- The E&O paper trail (coi_audit) is irrecoverable. This is a legally
-- untenable blast radius for a one-line mistake.
--
-- FIX:
-- 1) Add `agencies.deleted_at timestamptz` for soft-delete semantics.
-- 2) Change all agency_id FKs from ON DELETE CASCADE to ON DELETE RESTRICT
--    so the DB physically refuses to delete an agency that owns data.
-- 3) (App-side, separate change) Never call `.from('agencies').delete()`
--    in production code — use `.update({ deleted_at: now() })` instead.
-- =============================================================================

-- 1. Soft-delete column.
alter table agencies
  add column if not exists deleted_at timestamptz;

create index if not exists agencies_active_idx
  on agencies (id) where deleted_at is null;

-- 2. Re-point coi_clients.agency_id with RESTRICT.
alter table coi_clients
  drop constraint if exists coi_clients_agency_id_fkey;

alter table coi_clients
  add constraint coi_clients_agency_id_fkey
  foreign key (agency_id) references agencies(id) on delete restrict;

-- 3. Re-point cert_requests.agency_id if it exists (added in 0002).
-- Wrapped in DO block so this migration is safe to re-run.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'cert_requests'
      and constraint_name = 'cert_requests_agency_id_fkey'
  ) then
    alter table cert_requests
      drop constraint cert_requests_agency_id_fkey;
    alter table cert_requests
      add constraint cert_requests_agency_id_fkey
      foreign key (agency_id) references agencies(id) on delete restrict;
  end if;
end $$;

-- 4. Belt-and-suspenders: also flip the cascade on cert_requests.client_id
-- and coi_audit.client_id from CASCADE to RESTRICT so a stray client delete
-- doesn't wipe its history either. Soft-delete coi_clients via `active=false`
-- (already present) instead of hard delete.
alter table cert_requests
  drop constraint if exists cert_requests_client_id_fkey;
alter table cert_requests
  add constraint cert_requests_client_id_fkey
  foreign key (client_id) references coi_clients(id) on delete restrict;

alter table coi_audit
  drop constraint if exists coi_audit_client_id_fkey;
alter table coi_audit
  add constraint coi_audit_client_id_fkey
  foreign key (client_id) references coi_clients(id) on delete restrict;

-- policies → coi_clients keeps CASCADE for now (deleting a client legitimately
-- should remove their inactive-but-extant policies). Reconsider if compliance
-- requires retention.

-- NOTE: After applying this, attempting to delete an agency with any
-- coi_clients rows will raise:
--   ERROR: update or delete on table "agencies" violates foreign key constraint
-- That's the desired behavior. Use UPDATE … SET deleted_at = now() instead.
