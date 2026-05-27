# Form Intake Template — Per Form

> **Purpose:** Everything the COI portal needs to render a new insurance form end-to-end. Fill out one of these per form Brook wants to add.
>
> **Why this matters:** Each missing item below = a round-trip after the meeting. Each item filled in = one less day to go live. The fastest path from "Brook said she needs Form X" to "the portal can issue Form X" is filling this out completely on day one.

---

## 1. Form Identity

| Field | Value |
|---|---|
| Form code (e.g. `ACORD_27`) | |
| Display name (e.g. "Evidence of Property Insurance") | |
| Revision (e.g. `2016/03`) | |
| Page count | |
| US-letter portrait? | Y / N |

## 2. Template Files (attach to email / drop in shared folder)

- [ ] **Blank official PDF template** — the unfilled, ACORD-issued form. We hash it for tamper-detection; if Brook re-downloads later we'll know.
- [ ] **At least 1 sample completed certificate** — a real cert Brook has already produced (de-identified is fine). This is the "goldfinch" we tune coordinates against. Without it, every field position is a guess.
- [ ] **Bonus: 2-3 more samples with different coverage shapes** — e.g. one with WC only, one with GL+Auto+Umbrella. Catches edge cases up front.

## 3. Field List

For each fillable field on the form, fill out one row. Copy/paste this table as many times as needed, or send a screenshot of the form with arrows.

| Field key (snake_case) | Label as printed on form | Required? | Notes |
|---|---|---|---|
| | | | |
| | | | |

Examples that ship for ACORD 25 today: `producer_name`, `producer_address`, `insured_name`, `insurer_a_name`, `insurer_a_naic`, `gl_policy_number`, `gl_eff_date`, `gl_exp_date`, `gl_each_occurrence`, `wc_per_statute_check`, `holder_name`, `description_of_operations`, `signature_image`.

## 4. Default / Boilerplate Text

Things Brook always types in by hand today. Pre-loading these into the portal saves clicks per cert.

| Field | Default value |
|---|---|
| Default holder language (if any) | |
| Standard "Description of Operations" text | |
| Producer name (Brook's agency) | |
| Producer contact details | |
| Authorized rep signature image path | |

## 5. Coverage / Insurer Structure

ACORD 25 has 6 insurer slots (A-F) and 5 coverage types (GL, WC, Auto, Umbrella, Equipment). This form is:

- Insurer slot count: ____  (1? 6? Other?)
- Coverage types this form represents: ____
- Does the form have its own coverage-specific limit fields, or share ACORD 25 limit types? ____

## 6. Approval / Routing

- Who normally approves this form? Brook / agency admin / auto-approve / client signs themselves
- Does it need a wet signature, an e-signature, or just a stamped "Authorized Representative" image?
- Is there a delivery convention (PDF email attachment, fax — yes, still — printed and mailed)?
- Are there compliance words/phrases that MUST appear verbatim?

## 7. Edge Cases / Gotchas Brook Has Hit

Open-ended. Anything she's been burned by — a holder that always rejects a certain phrasing, a state that requires a rider, a coverage limit that's reported differently for different audiences.

| Situation | What goes wrong | How Brook fixes it |
|---|---|---|
| | | |

## 8. Frequency

Roughly how often does this form get issued? (1/week, 5/day, 1/month, "rarely but high-stakes")

This determines priority — we onboard the most-used forms first.

---

### Handoff Checklist

Before Brook sends this back, double-check:

- [ ] Blank PDF attached
- [ ] At least one sample completed cert attached
- [ ] Every field on the form has a row in the field list
- [ ] Default values filled where applicable
- [ ] Edge cases section has at least one entry (every form has at least one)

> If anything is unclear, leave it blank with a `?` — better to surface unknowns than to guess.
