-- Holder self-serve request link.
--
-- Certificate holders (GCs, landlords, project owners) chase the insured by
-- phone/email for certs. This token powers a shareable public link
-- (/request/[token]) where a holder files a request directly into the
-- client's normal approval pipeline — no login, no account.
--
-- The token is a 64-char random hex string, generated on demand from the
-- admin client page. Regenerating it (rotate) revokes the old link.

alter table coi_clients
  add column if not exists holder_link_token text;

create unique index if not exists coi_clients_holder_link_token_key
  on coi_clients (holder_link_token)
  where holder_link_token is not null;
