---
name: pdf-overlay-precision
description: Use when calibrating or adjusting field positions on the ACORD 25 PDF (or any PNG-overlay form). Enforces anchor-relative coordinate declarations so values never overlap labels. Invoke when COORDS values need to change, when adding a new field, when the no-overlap regression test fails, or when ACORD ships a template revision.
---

# PDF Overlay Precision

This skill enforces anchor-relative coordinate declarations for ACORD-style PDF rendering. Every drawn field declares a STATIC LABEL anchor + offset rather than absolute (x, y). When the template revises, regenerating the anchors JSON propagates the shift to every dependent field — no per-field retuning.

See [methodology.md](methodology.md) for why this exists and the failure modes it prevents.

## When to use

- Coords in `lib/coords.ts` need to change (PR feedback, defect report, new field).
- `npm test` fails on the no-overlap regression gate.
- ACORD ships a new revision of the template PDF.
- Adding support for a new ACORD form (101, 27, 28) using the same overlay strategy.

## Required reading before starting

1. `assets/template-anchors.json` — list of every extractable static label and its (x, y, width, height).
2. `lib/anchors.ts` — the resolver. Understand the five `side` values: `right`, `left`, `below`, `above`, `row`.
3. `lib/coords.ts` — the field declarations. Match the existing pattern.

## Procedure

### Step 1 — Regenerate the anchors JSON if the template changed

```
npm run extract-anchors
```

Skip this step if you're only adjusting offsets — the anchors JSON is only stale if `assets/acord-25-template.pdf` was replaced. Output is `assets/template-anchors.json` (~143 labels on ACORD 25 2016/03).

### Step 2 — Find the anchor for the field you're adjusting

For each field, the anchor should be the **closest static label with a stable spatial relationship**. Same row, ideally same column.

- Value sits to the RIGHT of a label (e.g., "Liberty Mutual" right of "INSURER A :"): `side: 'right'`
- Value sits BELOW a label (e.g., producer name below "PRODUCER"): `side: 'below'`
- Value sits ABOVE a label (e.g., bottom OTHER row description above "DESCRIPTION OF OPERATIONS"): `side: 'above'`
- Value's x is dictated by **table-column geometry** (not by any label) and y by the row's label: `side: 'row'`. Use `dx` as the absolute column x, `dy` to shift relative to the anchor's baseline.

Anchor lookup is case + whitespace insensitive. If the exact label text isn't in `template-anchors.json`, the resolver throws `MissingAnchorError` with the three closest matches by Levenshtein distance — copy one of those.

### Step 3 — Declare or modify the field in `lib/coords.ts`

Use the `declare` helper:

```ts
INSURER_A_NAME: declare('INSURER_A_NAME', {
  anchor: 'INSURER A :',
  side: 'right',
  dx: 8,       // clear of label's right edge
  dy: 0,       // same baseline
  size: 7.5,
  maxWidth: 220,
}),
```

For absolute-coord fields (no nearby label — DATE, SIGNATURE, DESCRIPTION free-form area), use `abs({...})` or `rect({...})`. These DON'T register in `FIELD_ANCHORS` and the no-overlap test ignores them.

If the chosen anchor has duplicates (e.g., "EACH OCCURRENCE" appears in both GL and UMB rows), add `nearY` to pin it:

```ts
UMB_LIMIT_EACH_OCC: declare('UMB_LIMIT_EACH_OCC', {
  anchor: 'EACH OCCURRENCE',
  side: 'right',
  dx: 72.5,
  dy: 0,
  nearY: 338,   // pin to UMB row, not GL row (y≈482)
  size: 7.5,
  maxWidth: 45,
}),
```

### Step 4 — Regenerate the calibration overlay

```
npm run calibrate
```

Opens `out/calibration.pdf`. Read the legend printed in stdout. Visually verify each red field dot sits clear of its anchor's blue box on the declared side.

A red dot **inside** a blue box means the value will overlap its label — adjust `dx`/`dy` and re-run.

### Step 5 — Run the test suite

```
npm test
```

Three tests must pass:

- `tests/anchors.test.ts` (12 tests) — resolver mechanics
- `tests/fillAcord25.positions.test.ts > regression gate` — every fixed field within ±3pt of its declared coord
- `tests/fillAcord25.positions.test.ts > no-overlap (anchor clearance gate)` — every anchor-relative field ≥3pt clear of its anchor label

If the no-overlap gate fails, the failure message names the field, gives current clearance, and tells you which anchor it's overlapping. Adjust `dx`/`dy` on that field.

### Step 6 — Regenerate the Sheffer reference and visually diff

```
npm run regen-sheffer
```

Compare `out/sheffer-regenerated.pdf` side-by-side with `~/Downloads/Sheffer COI (1).pdf` at 200% zoom. Every field should land in the same cell as the original. If anything looks off, return to Step 2.

### Step 7 — Commit and deploy

```
git add lib/coords.ts assets/template-anchors.json
git commit -m "fix(coords): <what you adjusted and why>"
git push
vercel --prod  # only after Wes's explicit OK
```

Generate a fresh cert from the deployed portal as final verification.

## Common failure modes and fixes

- **"Anchor X not found"** → check spelling against `template-anchors.json`. The resolver's error message lists three closest matches.
- **No-overlap gate fails on field Y** → look at the failure message's clearance value. Increase `dx` (for `side: right`) or `|dy|` (for `side: below`/`above`).
- **Position regression test fails after editing dx/dy** → expected during calibration. Iterate until visually correct, then commit.
- **Field draws on wrong row** → wrong anchor. Pick a label that's in the row you want.
- **Field draws at correct y but wrong x in a table column** → switch to `side: 'row'` and pass dx as the absolute column x.

## Things this skill enforces (do NOT do)

- Don't reintroduce absolute `{ x, y }` literals for fields that have a nearby label.
- Don't suppress the no-overlap test to ship a change. Adjust the field instead.
- Don't manually edit `template-anchors.json` — regenerate it from the source PDF.
- Don't move the `FIELD_ANCHORS` registration out of `declare()` — the test relies on it being populated as a side effect of coord resolution.

## Related files

| File | Purpose |
|------|---------|
| `lib/coords.ts` | Field declarations (one entry per drawn field) |
| `lib/anchors.ts` | Anchor lookup + offset resolver + did-you-mean errors |
| `assets/template-anchors.json` | Extracted static labels (generated, committed) |
| `scripts/extractAnchors.ts` | Regenerates the JSON from the source template |
| `scripts/calibrate.ts` | Visual diagnostic: anchor boxes + field dots |
| `scripts/regenSheffer.ts` | Renders the canonical Sheffer fixture for visual diff |
| `tests/anchors.test.ts` | Resolver unit tests |
| `tests/fillAcord25.positions.test.ts` | ±3pt regression + no-overlap gate |
