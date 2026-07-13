-- Primary & Noncontributory endorsement flag.
--
-- P&NC was previously unmodeled — holder contracts routinely demand it, and
-- the reviewer had no way to verify it was carried. Like addl_insured_blanket
-- and subrogation_waived this is a policy-level boolean; it feeds the
-- deterministic requirements engine (lib/requirementsCheck.ts). It is NOT
-- auto-rendered on the cert — P&NC language stays in the description block
-- under Brook's control.

alter table policies
  add column if not exists primary_noncontributory boolean not null default false;

comment on column policies.primary_noncontributory is
  'Policy carries a blanket Primary & Noncontributory endorsement (requirements engine input; not auto-rendered).';
