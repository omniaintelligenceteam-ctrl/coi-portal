# COI Portal — Supabase Setup

Schema + seed data for The Policy Place self-serve Certificate of Insurance portal. Multi-tenant by `agency_id` from day 1 (future white-label).

## Apply order

1. **Migration** — creates tables, enums, indexes, RLS
2. **Storage bucket** — create `coi-archive` (private)
3. **Seed** — agency, insurers, client, policies
4. **Signature upload** — Brook's PNG into `coi-archive/signatures/policy-place.png`

---

## 1. Apply the migration

### Option A: Supabase CLI
```bash
# from project root (C:/Users/default.DESKTOP-ON29PVN/PolicyPlace/coi-portal/)
supabase link --project-ref <new-policy-place-project-ref>
supabase db push
```

### Option B: SQL editor (faster for a fresh project)
Open the Supabase dashboard for the new project → SQL Editor → paste contents of `migrations/20260518_0001_coi_schema.sql` → Run.

---

## 2. Create the Storage bucket

In the Supabase dashboard → Storage → New bucket:
- Name: `coi-archive`
- Public: **NO** (private)
- Access pattern: server-issued signed URLs only

Folder layout inside the bucket:
```
coi-archive/
  signatures/
    policy-place.png    <- Brook's stamped signature
  certs/
    <client-uuid>/<cert-number>.pdf
```

---

## 3. Apply the seed

### Option A: Fresh reset (wipes data)
```bash
supabase db reset --linked
# reads migrations/ + seed/seed.sql automatically
```

### Option B: Manual paste
SQL Editor → paste contents of `seed/seed.sql` → Run. Idempotent only on a clean database — re-running will violate the unique constraint on `clients.contact_email` and `insurers.naic`.

---

## 4. Upload Brook's signature

**Brook needs to do this before the portal can generate live COIs:**

1. Provide a transparent-background PNG of her authorized-representative signature (~ 400 x 100 px, < 100 KB).
2. Upload via Supabase Storage → `coi-archive` → `signatures/` → name it `policy-place.png`.
3. Verify the path matches `agencies.signature_png_path` (`signatures/policy-place.png`) for the seeded Policy Place row. If you rename the file, update the column.

The seed row already has `signature_consent_text` + `signature_consent_at` populated (2026-05-18). Brook should re-affirm consent in writing if the consent text changes.

---

## 5. Verify RLS works

Run these in the SQL editor while impersonating a client JWT (Supabase dashboard → Authentication → Users → Impersonate).

```sql
-- as evans-electric@example.test, should return 1 row
select id, business_name, contact_email from clients;

-- should return 3 policies (GL, WC, EQUIPMENT)
select type, policy_number, eff_date, exp_date from policies;

-- empty until the first COI is generated
select cert_number, generated_at from coi_audit order by generated_at desc;
```

As the anon role (no JWT), all three queries should return **zero rows**.

As the service role, all queries return everything (RLS bypassed by design — server endpoints insert COI audit rows + manage policy data).

---

## Schema summary

| Table | Purpose | RLS |
|-------|---------|-----|
| `agencies` | Tenant root (Policy Place, future white-label) | off (reference data) |
| `clients` | Insured businesses | on — scoped to `contact_email = auth.email()` |
| `insurers` | NAIC carrier list | off (reference data) |
| `policies` | Active policies per client | on — via client join |
| `coi_audit` | Generated COI ledger | on — via client join |

Enum: `policy_type` = `GL | WC | AUTO | UMBRELLA | EQUIPMENT | OTHER`.

---

## Things Brook needs to do before launch

1. Upload signature PNG (step 4 above).
2. Confirm `evans-electric@example.test` swap to Evans Electric's real billing email (currently a test value — Phase 2 ships against the real address).
3. Re-affirm signature-consent language if anything changes from the seed text.
4. Verify the AUTO policy (if any) before go-live — Sheffer COI shows GL + WC + EQUIPMENT only; seed mirrors that.
