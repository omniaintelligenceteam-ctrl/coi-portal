-- =============================================================================
-- COI Portal — seed data
-- Mirrors the Sheffer Holdings COI shape:
--   1 agency  (The Policy Place)
--   2 insurers (Liberty Mutual, Great American)
--   1 client   (Evans Electric Inc)
--   3 policies (GL, WC, EQUIPMENT)
-- UUIDs are generated; we wire FKs via CTE / SELECT-by-natural-key.
-- =============================================================================

-- ---- 1. Agency: The Policy Place ------------------------------------------
insert into agencies (
  name,
  address1,
  address2,
  contact_name,
  phone,
  fax,
  email,
  signature_png_path,
  signature_consent_text,
  signature_consent_at
) values (
  'The Policy Place',
  '908 Poplar St',
  'Benton, KY 42025',
  'Brook Gaudy',
  '270-410-2015',
  'none',
  'brook@yourpolicyplace.com',
  'signatures/policy-place.png',
  'I authorize the COI portal at coi.yourpolicyplace.com to stamp my authorized-representative signature on Certificates of Insurance generated from my on-file policy data, subject to the system rendering only what is actually on file.',
  '2026-05-18T00:00:00Z'
);

-- ---- 2. Insurers ----------------------------------------------------------
insert into insurers (name, naic) values
  ('Liberty Mutual', '37206'),
  ('Great American Insurance Company', '16691');

-- ---- 3. Client: Evans Electric Inc ----------------------------------------
insert into coi_clients (
  agency_id,
  business_name,
  business_address1,
  business_address2,
  contact_email,
  active
)
select
  a.id,
  'Evans Electric Inc',
  '36 Louise Lane',
  'Benton, KY 42025',
  'evans-electric@example.test',
  true
from agencies a
where a.name = 'The Policy Place';

-- ---- 4. Policies ----------------------------------------------------------
-- 4a. General Liability — Liberty Mutual, BKS68636367, 02/10/2026—02/10/2027
insert into policies (
  client_id,
  type,
  insurer_id,
  policy_number,
  eff_date,
  exp_date,
  limits_jsonb,
  addl_insured_blanket,
  subrogation_waived
)
select
  c.id,
  'GL'::policy_type,
  i.id,
  'BKS68636367',
  date '2026-02-10',
  date '2027-02-10',
  '{"eachOccurrence":1000000,"damageToRented":300000,"medExp":5000,"personalAdvInjury":1000000,"generalAggregate":2000000,"productsCompOp":2000000}'::jsonb,
  false,
  false
from coi_clients c
  join insurers i on i.naic = '37206'
where c.business_name = 'Evans Electric Inc';

-- 4b. Workers Comp — Great American, WCF04252100, 06/08/2025—06/08/2026
insert into policies (
  client_id,
  type,
  insurer_id,
  policy_number,
  eff_date,
  exp_date,
  limits_jsonb,
  addl_insured_blanket,
  subrogation_waived
)
select
  c.id,
  'WC'::policy_type,
  i.id,
  'WCF04252100',
  date '2025-06-08',
  date '2026-06-08',
  '{"eachAccident":1000000,"diseaseEaEmployee":1000000,"diseasePolicyLimit":1000000}'::jsonb,
  false,
  false
from coi_clients c
  join insurers i on i.naic = '16691'
where c.business_name = 'Evans Electric Inc';

-- 4c. Equipment (Inland Marine) — Liberty Mutual, BKS68636367, 02/10/2026—02/10/2027
insert into policies (
  client_id,
  type,
  insurer_id,
  policy_number,
  eff_date,
  exp_date,
  limits_jsonb,
  addl_insured_blanket,
  subrogation_waived,
  description
)
select
  c.id,
  'EQUIPMENT'::policy_type,
  i.id,
  'BKS68636367',
  date '2026-02-10',
  date '2027-02-10',
  '{"equipmentLimit":100000}'::jsonb,
  false,
  false,
  'Contractors Equipment Rented/Leased'
from coi_clients c
  join insurers i on i.naic = '37206'
where c.business_name = 'Evans Electric Inc';
