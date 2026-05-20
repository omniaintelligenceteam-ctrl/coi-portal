# ACORD 25 Coord Ledger

Human-readable mirror of `lib/coords.ts`. Source of truth is the TypeScript file; this ledger is the running log of *why* each `dx`/`dy`/`nearY` is the value it is.

**Rule (enforced by review):** Every time a `dx`/`dy`/`nearY` literal changes in `lib/coords.ts`, update the matching row below in the same commit with the date, the cert that triggered the change, and a one-line reason.

Columns: `anchor` · `side` · `dx` · `dy` · `nearY` · `last verified` · `last cert` · `notes`

---

## HEADER

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| DATE | DATE_BOX | inside | 6 | 5 | — | 2026-05-18 | PP-20260408-0001 | Region-anchored, header top-right box |

## PRODUCER

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| PRODUCER_NAME | PRODUCER | below | 13.4 | 1.9 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 260 |
| PRODUCER_ADDRESS_1 | PRODUCER | below | 13.4 | -7.1 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 260 |
| PRODUCER_ADDRESS_2 | PRODUCER | below | 13.4 | -16.1 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 260 |

## CONTACT

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| CONTACT_NAME | NAME: | right | 15 | 0 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 220 |
| CONTACT_PHONE | PHONE | right | **18** | -2.5 | — | 2026-05-18 | PP-20260519-0002 | **Bumped 13→18 — Wes flagged phone too far left** |
| CONTACT_FAX | FAX | right | 4 | -2.5 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 75 |
| CONTACT_EMAIL | E-MAIL | right | 14 | -2.5 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 230 |

## INSURERS

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| INSURER_A_NAME | INSURER A : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 220 |
| INSURER_A_NAIC | INSURER A : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | NAIC column |
| INSURER_B_NAME | INSURER B : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_B_NAIC | INSURER B : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_C_NAME | INSURER C : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_C_NAIC | INSURER C : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_D_NAME | INSURER D : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_D_NAIC | INSURER D : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_E_NAME | INSURER E : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_E_NAIC | INSURER E : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_F_NAME | INSURER F : | right | 8 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| INSURER_F_NAIC | INSURER F : | row | 572 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## INSURED

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| INSURED_NAME | INSURED | below | 13.4 | 1.1 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 280 |
| INSURED_ADDRESS_1 | INSURED | below | 13.4 | -10.9 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 280 |
| INSURED_ADDRESS_2 | INSURED | below | 13.4 | -22.9 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 280 |

## CERTIFICATE / REVISION

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| CERT_NUMBER | CERTIFICATE NUMBER: | right | 4 | 0 | — | 2026-05-18 | PP-20260408-0001 | PP-0009 clearance fix |
| REVISION_NUMBER | REVISION NUMBER: | right | 4 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## GENERAL LIABILITY (GL)

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| GL_CHK_TYPE | COMMERCIAL GENERAL LIABILITY | left | **-12** | 0 | — | 2026-05-20 | PP-20260519-0002 | **Third pass: Wes flagged X still right-of-center in boxes. -9 → -12 (3pt further left)** |
| GL_CHK_OCCUR | OCCUR | left | **-12** | 0 | 470 | 2026-05-20 | PP-20260519-0002 | **Third pass: -9 → -12 to center X in OCCUR checkbox** |
| GL_CHK_AGG_POLICY | POLICY | left | **-12** | 0 | 422 | 2026-05-20 | PP-20260519-0002 | **Third pass: -9 → -12 to center X in POLICY checkbox** |
| GL_INSR_LTR | COMMERCIAL GENERAL LIABILITY | row | 28 | -6 | — | 2026-05-18 | PP-20260408-0001 | — |
| GL_POLICY_NUMBER | COMMERCIAL GENERAL LIABILITY | row | 223 | -6 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 92 |
| GL_EFF_DATE | COMMERCIAL GENERAL LIABILITY | row | **334** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 328→334 — Wes flagged GL dates still left of others; matched OTHER row** |
| GL_EXP_DATE | COMMERCIAL GENERAL LIABILITY | row | **380** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 374→380 — matched OTHER row** |
| GL_LIMIT_EACH_OCC | EACH OCCURRENCE | row | 523 | 0 | 482 | 2026-05-18 | PP-20260408-0001 | nearY pins to GL row |
| GL_LIMIT_DAMAGE_RENT | DAMAGE TO RENTED | row | 523 | **-6** | — | 2026-05-18 | PP-20260519-0002 | **Nudged up -8 → -6 — Wes flagged still a hair low after first drop** |
| GL_LIMIT_MED_EXP | MED EXP (Any one person) | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| GL_LIMIT_PERS_ADV_INJ | PERSONAL & ADV INJURY | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| GL_LIMIT_GEN_AGG | GENERAL AGGREGATE | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| GL_LIMIT_PROD_COMP_OP | PRODUCTS - COMP/OP AGG | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## AUTO

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| AUTO_INSR_LTR | AUTOMOBILE LIABILITY | row | 28 | -6 | — | 2026-05-18 | PP-20260408-0001 | — |
| AUTO_POLICY_NUMBER | AUTOMOBILE LIABILITY | row | 223 | -6 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 92 |
| AUTO_EFF_DATE | AUTOMOBILE LIABILITY | row | **334** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 328→334 — column alignment with OTHER/GL** |
| AUTO_EXP_DATE | AUTOMOBILE LIABILITY | row | **380** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 374→380** |
| AUTO_LIMIT_CSL | COMBINED SINGLE LIMIT | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| AUTO_LIMIT_BI_PER_PERS | BODILY INJURY (Per person) | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| AUTO_LIMIT_BI_PER_ACC | BODILY INJURY (Per accident) | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| AUTO_LIMIT_PD | PROPERTY DAMAGE | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## UMBRELLA

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| UMB_INSR_LTR | UMBRELLA LIAB | row | 28 | -6 | — | 2026-05-18 | PP-20260408-0001 | — |
| UMB_POLICY_NUMBER | UMBRELLA LIAB | row | 223 | -6 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 92 |
| UMB_EFF_DATE | UMBRELLA LIAB | row | **334** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 328→334 — column alignment** |
| UMB_EXP_DATE | UMBRELLA LIAB | row | **380** | -6 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 374→380** |
| UMB_LIMIT_EACH_OCC | EACH OCCURRENCE | row | 523 | 0 | 338 | 2026-05-18 | PP-20260408-0001 | nearY pins to UMB row (GL is at y≈482) |
| UMB_LIMIT_AGG | AGGREGATE | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## WORKERS COMPENSATION (WC)

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| WC_CHK_PER_STATUTE | PER | left | **-18** | **-4** | — | 2026-05-20 | PP-20260519-0002 | **Third pass: dx -9→-18, dy 0→-4. The PER STATUTE "checkbox" is a wider, taller cell that spans the two-line "PER / STATUTE" label height. Needs both a larger leftward shift (cell width) AND a dy drop (cell height) so the X centers between the two text lines instead of riding the top line. Visually verified at 400dpi.** |
| WC_OFFICER_YN | WC_OFFICER_BOX | inside | 3.5 | 3 | — | 2026-05-18 | PP-20260519-0002 | Region-anchored. Value sourced via `coiInputBuilder` (officerExcluded: true → "Y") |
| WC_INSR_LTR | WORKERS COMPENSATION | row | 28 | -9 | — | 2026-05-18 | PP-20260408-0001 | — |
| WC_POLICY_NUMBER | WORKERS COMPENSATION | row | 223 | -9 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 92 |
| WC_EFF_DATE | WORKERS COMPENSATION | row | **334** | -9 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 328→334 — column alignment** |
| WC_EXP_DATE | WORKERS COMPENSATION | row | **380** | -9 | — | 2026-05-18 | PP-20260519-0002 | **Second pass 374→380** |
| WC_LIMIT_EACH_ACC | E.L. EACH ACCIDENT | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| WC_LIMIT_DIS_EA_EMPL | E.L. DISEASE - EA EMPLOYEE | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |
| WC_LIMIT_DIS_POL_LIM | E.L. DISEASE - POLICY LIMIT | row | 523 | 0 | — | 2026-05-18 | PP-20260408-0001 | — |

## OTHER (Equipment row)

All anchor to `E.L. DISEASE - POLICY LIMIT` with `dy: -26` (one row below WC).

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| OTHER_INSR_LTR | E.L. DISEASE - POLICY LIMIT | row | 28 | -26 | — | 2026-05-18 | PP-20260408-0001 | — |
| OTHER_DESCRIPTION | E.L. DISEASE - POLICY LIMIT | row | **52** | -26 | — | 2026-05-18 | PP-20260519-0002 | **Nudged left 57→52 — Wes flagged Contractors text too far right** |
| OTHER_POLICY_NUMBER | E.L. DISEASE - POLICY LIMIT | row | 223 | -26 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 92 |
| OTHER_EFF_DATE | E.L. DISEASE - POLICY LIMIT | row | **334** | -26 | — | 2026-05-18 | PP-20260519-0002 | **Shifted right 328→334 — second nudge on Wes's OTHER row feedback** |
| OTHER_EXP_DATE | E.L. DISEASE - POLICY LIMIT | row | **380** | -26 | — | 2026-05-18 | PP-20260519-0002 | **Shifted right 374→380 — second nudge on Wes's OTHER row feedback** |
| OTHER_LIMIT | E.L. DISEASE - POLICY LIMIT | row | 523 | -26 | — | 2026-05-18 | PP-20260408-0001 | — |

## DESCRIPTION

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| DESCRIPTION | DESC_BOX | inside | 5 | 67 | — | 2026-05-18 | PP-20260408-0001 | Region-anchored, maxWidth 540, size 7 |

## CERTIFICATE HOLDER

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| HOLDER_NAME | CERTIFICATE HOLDER | below | 13.4 | -7 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 290 |
| HOLDER_ADDRESS_1 | CERTIFICATE HOLDER | below | 13.4 | -19 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 290 |
| HOLDER_ADDRESS_2 | CERTIFICATE HOLDER | below | 13.4 | -31 | — | 2026-05-18 | PP-20260408-0001 | maxWidth 290 |

## SIGNATURE

| Field | Anchor | Side | dx | dy | nearY | Last verified | Last cert | Notes |
|---|---|---|---|---|---|---|---|---|
| SIGNATURE | SIG_BOX | (region rect) | 0 | 0 | — | 2026-05-18 | PP-20260408-0001 | Inherits x/y/width/height from region |

---

## Iteration log

| Date | Cert | Round | Outcome |
|---|---|---|---|
| 2026-05-18 | PP-20260519-0002 | 1 | Initial pass: phone +5pt, four checkbox X marks centered (-6.5/+1.5), Damage-to-Rented limit dy -8, all eff/exp dates +6pt, officerExcluded defaulted true in builder. Awaiting Wes visual sign-off → if "still off," iterate the specific offset and append a new row here. |
| 2026-05-20 | PP-20260519-0002 | 3 | Wes flagged all four checkbox X marks still right-of-center in their boxes. First moved all four uniformly from -9 → -12; visual check at 400dpi showed the three GL checkboxes (TYPE, OCCUR, AGG_POLICY) landed centered, but WC PER STATUTE overshot LEFT of its cell. Root cause: PER STATUTE's "checkbox" is a wider empty table cell (no small inner box drawn) while the GL boxes are small inner squares — they need different offsets. Final values: GL three at -12, WC PER STATUTE at -18. Both visually verified at 400dpi against rendered Sheffer cert. cert-doctor PASS 71/71. **Lesson: not all ACORD checkboxes share geometry; per-anchor visual verification beats uniform tuning.** |
