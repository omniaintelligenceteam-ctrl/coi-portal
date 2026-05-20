# Methodology: Why Anchor-Relative Coordinates

## The problem this solves

ACORD 25's official fillable PDF is **XFA-only**: its `/AcroForm` dict has zero text-field or button widgets. All form data lives in an XFA XML stream that `pdf-lib` and its forks cannot read or write. So the canonical "fill named fields by name" approach is impossible without a third-party SaaS (Anvil, DocSpring) or `pdftk` server.

We pivoted to **PNG-overlay**: rasterize the template once (`assets/template/acord-25-page-1.png`), draw it as a full-page background, then `drawText` each value at hardcoded coordinates. This works visually but introduces a new failure mode:

> Coordinates drift from the rasterized template's actual cell positions, and there's no mechanism to catch the drift. Manual calibration over five iteration loops produced PP-20260518-0009, which **still** had three label-overlap defects (INSURER_A_NAME on top of "INSURER A :", CERT_NUMBER on top of "CERTIFICATE NUMBER:", OTHER_DESCRIPTION above the OTHER row).

The class of bug: **values declared at the label START position instead of label END + padding**, or **at the wrong row's y baseline because adjacent rows look interchangeable**. Both fail silently — no exception, no test fail.

## The fix: derive coordinates from the labels themselves

Every drawn field declares a STATIC LABEL anchor + an offset. The resolver in `lib/anchors.ts` reads the anchor's `(x, y, width, height)` from `assets/template-anchors.json` and computes the field's `(x, y)` at module load.

The anchors JSON is generated once from `assets/acord-25-template.pdf` via `pdfjs.getTextContent()`. Even though the form layer is XFA-only, the STATIC labels ("INSURER A :", "EACH OCCURRENCE", "CERTIFICATE NUMBER:", "WORKERS COMPENSATION") live in the page content stream and ARE extractable.

### Why this is self-healing

If ACORD ships a template revision that shifts a row by 5pt, the static label moves with it. Regenerating `template-anchors.json` propagates the shift to every field anchored to that label. Today's alternative would be re-tuning every coordinate by hand — every single time ACORD revises any form.

### Region anchors (Phase 1.8)

Some fields have no nearby text label: the DATE box, the Y/N officer-excluded box, the DESCRIPTION free-form area, and the SIGNATURE rectangle. These are now anchored to **hand-authored region rects** in `assets/template-regions.json` (DATE_BOX, WC_OFFICER_BOX, DESC_BOX, SIG_BOX) via `side: 'inside'`. This means:

- **Zero hardcoded coordinates anywhere in `lib/coords.ts`** — every field goes through the resolver.
- Region-anchored fields get the same propagation property: update `template-regions.json` → all dependent fields shift automatically.
- The cert-doctor `region-bounds` gate verifies each region-anchored field lands inside its region, catching drift just like the label-clearance gate catches label overlap.

## The cert-doctor gate chain

`npm run cert-doctor` replaces the manual "open two PDFs and squint" calibration loop. It runs seven checks:

| Gate | Failure message format | What it catches |
|------|----------------------|-----------------|
| `template-hash` | `SHA mismatch recorded=abc... actual=xyz...` | Anchors JSON stale after template PDF update |
| `anchor-resolution` | `MissingAnchorError: "X" not found. Did you mean: ...` | Typos in anchor text; catches PP-0009 before it renders |
| `anchor-clearance` | `FIELD only 0.00pt right of "LABEL" (need ≥3)` | Field origin inside or too close to its anchor label |
| `region-bounds` | `FIELD (x, y) falls OUTSIDE region "NAME"` | Region-anchored field overshoots its box |
| `page-bounds` | `FIELD at (x, y) is off-page` | Typo in dx/dy that sends a field off the 612×792 page |
| `field-collision` | `FIELD_A ↔ FIELD_B: bboxes overlap` | Two declared fields land on top of each other with typical values |
| `rendered-overlap` | `FIELD rendered "text" overlaps "LABEL" bbox` | Rendered text (with actual width) extends into an anchor label |

If all gates pass, the cert is guaranteed to be free of every class of defect we have ever shipped.

### Why the rendered-overlap gate closes a gap the clearance gate leaves open

The clearance gate checks the field's **origin** against its anchor. But the rendered string has **width**. A field with dx=8 passes the clearance gate; if the insurer name is 40 characters long and runs rightward, it can still overlap the NAIC column header. The rendered-overlap gate measures the actual pdfjs-reported text width and verifies the full bounding box is clear.

### Why the field-collision gate closes a gap the others leave open

Two fields can each individually pass clearance from their own anchors, yet still collide with each other (GL_POLICY_NUMBER and GL_EFF_DATE sharing a row). The collision gate tests all pairs of predicted bboxes using typical-length values.

## Per-field visual regression

`npm run crop-diff` compares each field's crop from the Sheffer fixture render against committed golden crops in `assets/golden-crops/`. Failures report field name + similarity score. This catches:

- Font rendering drift if a `pdf-lib` or Node upgrade changes glyph metrics.
- Color/opacity shifts.
- Background rasterization artifacts.
- Any visual change the coordinate-math tests don't detect.

Golden crops are ~5KB each × 68 fields ≈ 340KB committed. Run `npm run crop-diff -- --baseline` after deliberate visual changes to update them.

## The five coordinate sides (+ inside)

| Side | Math | Use when |
|------|------|----------|
| `right` | `x = a.x + a.width + dx`, `y = a.y + dy` | Value to the right of a label, same baseline (most common) |
| `left` | `x = a.x + dx`, `y = a.y + dy` | Value to the left of a label, same baseline (checkboxes) |
| `below` | `x = a.x + dx`, `y = a.y - LINE_HEIGHT + dy` | Value one line below a label, same x-start |
| `above` | `x = a.x + dx`, `y = a.y + LINE_HEIGHT + dy` | Value one line above a label, same x-start |
| `row` | `x = dx` (absolute), `y = a.y + dy` | Value's x is dictated by table column geometry (not derivable from labels), y by row anchor |
| `inside` | `x = a.x + dx`, `y = a.y + dy` | Value inside a hand-authored region rect (DATE_BOX, etc.) |

`row` is the escape hatch for the body of coverage rows (INSR LTR, POLICY NUMBER, EFF/EXP dates). `inside` is the escape hatch for fields with no nearby text label at all.

## Checkbox geometry: not all "left of label" checkboxes share dimensions

ACORD 25 has two distinct checkbox geometries that both anchor `side: 'left'` of a text label but require **different** dx/dy offsets:

1. **Small inner-box checkboxes** — a small drawn square sits immediately left of the label (e.g. GL_CHK_TYPE next to "COMMERCIAL GENERAL LIABILITY", GL_CHK_OCCUR next to "OCCUR", GL_CHK_AGG_POLICY next to "POLICY"). The cell IS the small box. `dx ≈ -12, dy = 0` centers in this geometry (verified 2026-05-20 at 400dpi).

2. **Wide+tall empty-cell checkboxes** — no small inner box drawn; the entire wider table cell IS the checkbox region, often spanning the height of a multi-line label (e.g. WC_CHK_PER_STATUTE next to two-line "PER / STATUTE"). `dx ≈ -18, dy ≈ -4` centers in this geometry.

**Failure mode this prevents:** Bumping all checkbox dx values by the same amount (e.g. all -9 → -12) centered the three small-box GL checks but pushed WC_CHK_PER_STATUTE outside its cell entirely. Round 3 of PP-20260519-0002 burned three iterations diagnosing this.

**Rule:** When adjusting any checkbox dx, render at ≥400dpi and inspect EACH checkbox individually against the raw template (`out/template-hires.png` or `out/template-only.png`). Don't assume `side: 'left'` checkboxes share a single tuning curve. If a checkbox is near multi-line label text, expect both dx AND dy to need adjustment.

## Duplicate anchor disambiguation

Some label texts appear multiple times on the page:

- **"EACH OCCURRENCE"** — once in GL row (y≈482), once in UMB row (y≈338)
- **"OCCUR"** — once in GL row, once in UMB row
- **"CLAIMS-MADE"** — same pattern
- **"$"** — many times in the limits column

When the resolver finds multiple matches, it returns the topmost (highest y) unless the caller passes `nearY` to pin to a specific row. A duplicate not disambiguated by `nearY` silently resolves to the wrong row — the collision gate will usually catch this if two fields end up stacked, but the safest practice is to always add `nearY` when anchoring to a label that appears on more than one row.

## Levenshtein "did you mean" UX

`MissingAnchorError` returns the three closest matches by Levenshtein distance over normalized text. This is the dominant failure mode when refactoring: typo the anchor text and instead of a silent no-render, you get:

```
Anchor "INSURRR A :" not found in assets/template-anchors.json or assets/template-regions.json.
Did you mean one of: "INSURER A :", "INSURER B :", "INSURER C :"?
Run `npm run extract-anchors` to regenerate if the template changed.
```

## Forward-compat: adding ACORD 101 / 27 / 28

When Brook needs a new form type:

1. Drop the new template PDF into `assets/acord-NNN-template.pdf`.
2. Run `npm run extract-anchors` (extend the script to take a `--template` flag or replicate as a new script).
3. Rasterize via `npm run rasterize` (same pattern).
4. Author a new `lib/coordsAcord101.ts` (or wherever) using the same `declare()` pattern.
5. Add region anchors for any un-labeled boxes to a new `assets/acord-101-regions.json`.
6. Add fixture + position regression + no-overlap + cert-doctor integration tests.

Anchor mechanics carry forward unchanged. The skill applies the same way.
