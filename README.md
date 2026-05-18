# The Policy Place — COI Portal

Self-serve Certificate of Insurance portal for **The Policy Place** (Brook Gaudy, Benton KY). Insurance clients log in, select on-file coverages, enter the Certificate Holder, and get a finished ACORD 25 PDF emailed with Brook's authorized-representative signature and today's date.

## Status

**Phase 1 — PDF fill mechanic (in progress)**. Pure Node + `@cantoo/pdf-lib`. No web app, no auth, no DB yet — those land in Phase 2 once the PDF mechanic is proven against the reference sample.

See `~/.claude/plans/c-users-default-desktop-on29pvn-downloa-floofy-unicorn.md` for the full implementation plan.

## Local Dev

```sh
npm install
npm run discover-fields   # one-time: dumps ACORD 25 field names to assets/acord-fields.json
npm test                  # vitest unit tests
npm run regen-sheffer     # generates out/sheffer-regenerated.pdf for visual diff
```

## Stack

- `@cantoo/pdf-lib` — active 2025 fork of pdf-lib (upstream abandoned since Nov 2021)
- TypeScript (strict, ESM, NodeNext)
- vitest for unit tests
- Future: Next.js 15 (Phase 2), Supabase auth + Postgres + Storage (Phase 2), Resend (Phase 3), Vercel Hobby (Phase 3)

## Critical implementation notes

1. **`NeedAppearances` flag is mandatory** — without it, filled fields render blank in Acrobat. Set on the AcroForm dict immediately after `PDFDocument.load()`.
2. **Z-order on signature stamp** — flatten the form FIRST, THEN draw the signature PNG. Drawing before flatten renders the image behind the form layer (pdf-lib Issue #35).
3. **Hard expiry gate** — server-side filter on `policies.exp_date >= today` before generation; never trust client-side filtering. E&O critical.
4. **No free-text cert fields** — Cert Holder is structured name + address only. Additional Insured and Waiver of Subrogation are policy-data-driven, never client-selectable.

## License

Private — internal to The Policy Place.
