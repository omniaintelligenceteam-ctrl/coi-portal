---
name: pdf-overlay-precision
description: Use when calibrating or adjusting field positions on the ACORD 25 PDF (or any PNG-overlay form). Enforces anchor-relative coordinate declarations so values never overlap labels. Invoke when COORDS values need to change, when adding a new field, when any cert-doctor gate fails, or when ACORD ships a template revision.
---

# PDF Overlay Precision

This skill enforces anchor-relative coordinate declarations for ACORD-style PDF rendering. Every drawn field declares a STATIC LABEL anchor + offset (or a REGION anchor for fields with no nearby text label) rather than absolute (x, y). When the template revises, regenerating the anchors JSON propagates the shift to every dependent field — no per-field retuning.

See [methodology.md](methodology.md) for why this exists and the failure modes it prevents.

## When to use

- Coords in `lib/coords.ts` need to change (PR feedback, defect report, new field).
- `npm run cert-doctor` fails on any gate.
- ACORD ships a new revision of the template PDF.
- Adding support for a new ACORD form (101, 27, 28) using the same overlay strategy.

## Required reading before starting

1. `assets/template-anchors.json` — extracted text labels (generated). Used by text-anchored fields.
2. `assets/template-regions.json` — hand-authored region rects for DATE_BOX, WC_OFFICER_BOX, DESC_BOX, SIG_BOX. Used by region-anchored fields.
3. `lib/anchors.ts` — the resolver. Understand the six `side` values: `right`, `left`, `below`, `above`, `row`, `inside`.
4. `lib/coords.ts` — the field declarations. Match the existing pattern.

## Procedure (3 steps)

### Step 1 — Regenerate the anchors JSON if the template changed

```
npm run extract-anchors
```

Skip if you're only adjusting offsets. Required if `assets/acord-25-template.pdf` was replaced or cert-doctor reports a SHA mismatch. Output is `assets/template-anchors.json` (~143 labels on ACORD 25 2016/03) with a `source_sha256` field that cert-doctor uses to detect template drift.

For region anchors (DATE_BOX, WC_OFFICER_BOX, DESC_BOX, SIG_BOX): these are hand-maintained in `assets/template-regions.json` because they're drawn boxes, not text labels. Update them manually if the template shifts those boxes.

### Step 2 — Declare or modify the field in `lib/coords.ts`

**Text-anchored field** (value near a static label):

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

**Region-anchored field** (value inside a named box with no nearby text label):

```ts
DATE: declare('DATE', {
  anchor: 'DATE_BOX',   // resolved from assets/template-regions.json
  side: 'inside',       // field lands INSIDE the region rect
  dx: 6,                // offset from region's bottom-left x
  dy: 5,                // offset from region's bottom-left y
  size: 8,
}),
```

**Table-column field** (x dictated by column geometry, y by row anchor):

```ts
GL_POLICY_NUMBER: declare('GL_POLICY_NUMBER', {
  anchor: 'COMMERCIAL GENERAL LIABILITY',
  side: 'row',
  dx: 223,   // absolute column x
  dy: -6,    // offset from anchor baseline
  size: 7.5,
  maxWidth: 92,
}),
```

**Duplicate anchor disambiguation** (same label text appears on multiple rows):

```ts
UMB_LIMIT_EACH_OCC: declare('UMB_LIMIT_EACH_OCC', {
  anchor: 'EACH OCCURRENCE',
  side: 'right',
  dx: 72.5,
  dy: 0,
  nearY: 338,   // pin to UMB row; GL row is at y≈482
  size: 7.5,
  maxWidth: 45,
}),
```

Anchor lookup is case + whitespace insensitive. If the anchor text isn't in `template-anchors.json` or `template-regions.json`, the resolver throws `MissingAnchorError` with the three closest matches by Levenshtein distance.

### Step 3 — Run cert-doctor

```
npm run cert-doctor
```

Must exit 0 before any commit. Cert-doctor runs all gates:

| Gate | What it catches |
|------|-----------------|
| template-hash | anchors JSON generated from a different template PDF |
| anchor-resolution | misspelled anchor text → did-you-mean suggestions |
| anchor-clearance | field origin too close to its anchor label (PP-0009 class) |
| region-bounds | region-anchored field resolved outside its region rect |
| page-bounds | field coordinate off the 612×792 page |
| field-collision | two fields' bboxes overlap with typical values |
| rendered-overlap | rendered text bbox overlaps its anchor label bbox |

If any gate fails, the output names the field, the violation type, and a suggested fix. Adjust `dx`/`dy` and re-run until PASS.

**Visual regression** (run after cert-doctor passes):

```
npm run crop-diff
```

Compares every field's crop of the Sheffer render against committed goldens in `assets/golden-crops/`. If a coord change shifts a field visually, this fails with the field name and similarity score. After deliberately moving a field, update its golden:

```
npm run crop-diff -- --baseline
```

Then commit the new golden alongside the `lib/coords.ts` change.

## Common failure modes and fixes

- **"Anchor X not found"** → check spelling against `template-anchors.json` (text labels) or `template-regions.json` (region names). The error message lists three closest matches.
- **anchor-clearance fails on field Y** → increase `dx` (for `side: right`) or `|dy|` (for `side: below`/`above`).
- **region-bounds fails** → the region rect in `template-regions.json` is too small or the dx/dy overshoots it.
- **field-collision between A and B** → one field's maxWidth is too large, or the column dx values are too close.
- **crop-diff fails with similarity 0.7X** → the field moved visually; verify cert-doctor passes first, then update the golden.
- **template-hash mismatch** → run `npm run extract-anchors` to regenerate from the current PDF.

## Things this skill enforces (do NOT do)

- Don't reintroduce absolute `{ x, y }` literals — use `declare()` with a label or region anchor. Every field in `lib/coords.ts` is anchor-relative by design.
- Don't suppress any cert-doctor gate. Adjust the field instead.
- Don't manually edit `template-anchors.json` — regenerate it from the source PDF.
- Don't manually edit `assets/golden-crops/*.png` — regenerate via `npm run crop-diff -- --baseline`.
- Don't move `FIELD_ANCHORS` registration out of `declare()` — cert-doctor and tests rely on it.

## Related files

| File | Purpose |
|------|---------|
| `lib/coords.ts` | Field declarations (one entry per drawn field) |
| `lib/anchors.ts` | Anchor lookup + offset resolver + did-you-mean errors |
| `lib/pdfInspect.ts` | Shared PDF text extraction + bbox helpers |
| `lib/certDoctorCore.ts` | Check engine used by both cert-doctor CLI and tests |
| `assets/template-anchors.json` | Extracted text labels (generated, committed) |
| `assets/template-regions.json` | Hand-authored region rects (committed) |
| `assets/golden-crops/` | Per-field PNG crops for visual regression (committed) |
| `scripts/certDoctor.ts` | CLI gate — run before every commit touching coords |
| `scripts/cropDiff.ts` | Visual regression — compare + baseline |
| `scripts/extractAnchors.ts` | Regenerates template-anchors.json from source PDF |
| `scripts/calibrate.ts` | Visual diagnostic: anchor boxes + field dots (use during tuning) |
| `scripts/regenSheffer.ts` | Renders the canonical Sheffer fixture for spot-check |
| `tests/anchors.test.ts` | Resolver unit tests |
| `tests/fillAcord25.positions.test.ts` | ±3pt regression + no-overlap + text-width + collision gates |
