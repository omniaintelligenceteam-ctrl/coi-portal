# Methodology: Why Anchor-Relative Coordinates

## The problem this solves

ACORD 25's official fillable PDF is **XFA-only**: its `/AcroForm` dict has zero text-field or button widgets. All form data lives in an XFA XML stream that `pdf-lib` and its forks cannot read or write. So the canonical "fill named fields by name" approach is impossible without a third-party SaaS (Anvil, DocSpring) or `pdftk` server.

We pivoted to **PNG-overlay**: rasterize the template once (`assets/template/acord-25-page-1.png`), draw it as a full-page background, then `drawText` each value at hardcoded coordinates. This works visually but introduces a new failure mode:

> Coordinates drift from the rasterized template's actual cell positions, and there's no mechanism to catch the drift. Manual calibration over five iteration loops produced PP-20260518-0009, which **still** had three label-overlap defects (INSURER_A_NAME on top of "INSURER A :", CERT_NUMBER on top of "CERTIFICATE NUMBER:", OTHER_DESCRIPTION above the OTHER row).

The class of bug: **values declared at the label START position instead of label END + padding**, or **at the wrong row's y baseline because adjacent rows look interchangeable**. Both fail silently — no exception, no test fail (the ±3pt position test passes because the rendered position matches the declared coord, even when the declared coord is wrong).

## The fix: derive coordinates from the labels themselves

Every drawn field declares a STATIC LABEL anchor + an offset. The resolver in `lib/anchors.ts` reads the anchor's `(x, y, width, height)` from `assets/template-anchors.json` and computes the field's `(x, y)` at module load.

The anchors JSON is generated once from `assets/acord-25-template.pdf` via `pdfjs.getTextContent()`. Even though the form layer is XFA-only, the STATIC labels ("INSURER A :", "EACH OCCURRENCE", "CERTIFICATE NUMBER:", "WORKERS COMPENSATION") live in the page content stream and ARE extractable.

### Why this is self-healing

If ACORD ships a template revision that shifts a row by 5pt, the static label moves with it. Regenerating `template-anchors.json` propagates the shift to every field anchored to that label. Today's alternative would be re-tuning every coordinate by hand — every single time ACORD revises any form.

### Why this catches the PP-0009 class of bug

The no-overlap regression test (`tests/fillAcord25.positions.test.ts > no-overlap (anchor clearance gate)`) walks every anchor-relative field and verifies the resolved coord is ≥3pt clear of the anchor label's bounding box on the declared side. Drop `INSURER_A_NAME.dx` to 0 and the test fails immediately with:

```
INSURER_A_NAME: x=345.5 only 0.00pt right of "INSURER A :" (ends at x=345.5); need ≥3
```

No human visual check required. The math is the test.

## When NOT to use anchor-relative

Some fields have no nearby usable label:

- **DATE** in the top-right header box — the box itself is unlabeled (the "DATE (MM/DD/YYYY)" text is above the box, not inside it, and the box is far from any row-anchor)
- **SIGNATURE** rectangle in the Authorized Representative cell — the AUTHORIZED REPRESENTATIVE label is above the cell, and a rect needs (x, y, width, height) not a (x, y) point
- **DESCRIPTION** free-form area — the DESCRIPTION OF OPERATIONS header is at the top of a large blank area; the value can land anywhere inside it

These keep absolute `{ x, y }` declarations via the `abs()` or `rect()` helpers. They DON'T register in `FIELD_ANCHORS` so the no-overlap test ignores them.

## The five sides

| Side | Math | Use when |
|------|------|----------|
| `right` | `x = a.x + a.width + dx`, `y = a.y + dy` | Value to the right of a label, same baseline (most common) |
| `left` | `x = a.x + dx`, `y = a.y + dy` | Value to the left of a label, same baseline (rare; for right-aligned cells) |
| `below` | `x = a.x + dx`, `y = a.y - LINE_HEIGHT + dy` | Value one line below a label, same x-start |
| `above` | `x = a.x + dx`, `y = a.y + LINE_HEIGHT + dy` | Value one line above a label, same x-start |
| `row` | `x = dx` (absolute), `y = a.y + dy` | Value's x is dictated by table column geometry (not derivable from labels), y by row anchor |

`row` is the escape hatch for the body of coverage rows (INSR LTR, POLICY NUMBER, EFF/EXP dates). The columns of the GL / AUTO / UMB / WC / OTHER rows are defined by table rules in the rasterized PNG, not by extractable text. We use absolute x for those columns and let the anchor drive y so the row stays locked to its label.

## Duplicate anchor disambiguation

Some label texts appear multiple times on the page. The two known cases on ACORD 25:

- **"EACH OCCURRENCE"** — once in GL row (y≈482), once in UMB row (y≈338)
- **"OCCUR"** — once in GL row, once in UMB row
- **"CLAIMS-MADE"** — same pattern
- **"$"** — many times in the limits column

When the resolver finds multiple matches, it returns the topmost (highest y) unless the caller passes `nearY` to disambiguate. UMB_LIMIT_EACH_OCC passes `nearY: 338` to pin to the UMB row.

A duplicate not disambiguated by `nearY` is silently wrong. Catching this in the test suite is future work (could compare each FIELD_ANCHORS entry's `nearY` against the resolved anchor's y and flag mismatches >LINE_HEIGHT).

## Levenshtein "did you mean" UX

`MissingAnchorError` returns the three closest matches by Levenshtein distance over normalized text. This is the dominant failure mode when refactoring: typo the anchor text and instead of a silent no-render, you get:

```
Anchor "INSURRR A :" not found in assets/template-anchors.json.
Did you mean one of: "INSURER A :", "INSURER B :", "INSURER C :"?
Run `npm run extract-anchors` to regenerate if the template changed.
```

The error explicitly mentions the regen command because the other failure mode is the template having actually changed (a real label moved or was renamed).

## Why not pixel-diff regression?

Pixel-diff (render to PNG, diff against golden) catches MORE classes of bug — font rendering differences, color shifts, missing background sections. But:

- Golden PNG per fixture is ~700KB committed; multiple fixtures balloon the repo.
- False positives on antialiasing differences between dev/CI environments.
- Diagnostic output is "pixels X..Y differ" — not actionable without a human eye.

The anchor-clearance + ±3pt position tests catch the class of bug we actually hit (label overlap, row misalignment) with **text-based assertions** that produce actionable error messages. Pixel-diff is reserved for future work if we ever ship a templating engine that's harder to reason about.

## Forward-compat: adding ACORD 101 / 27 / 28

When Brook needs a new form type:

1. Drop the new template PDF into `assets/acord-NNN-template.pdf`.
2. Run `npm run extract-anchors` (extend the script to take a `--template` flag or replicate as a new script).
3. Rasterize via `npm run rasterize` (same pattern).
4. Author a new `lib/coordsAcord101.ts` (or wherever) using the same `declare()` pattern.
5. Add fixture + position regression + no-overlap tests.

Anchor mechanics carry forward unchanged. The skill applies the same way.
