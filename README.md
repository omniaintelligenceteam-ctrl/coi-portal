# The Policy Place — COI Portal

Self-serve Certificate of Insurance portal for **The Policy Place** (Brook Gaudy, Benton KY). Insurance clients sign in with a magic link, select on-file coverages and a certificate holder, and submit a request. Brook reviews in an approval queue (or auto-approves trusted clients) and the finished ACORD 25 PDF emails to the holder under Brook's authorized-representative signature.

Live: https://coi-portal.vercel.app

## Stack

- **Next.js 16** (app router, RSC, server actions) on Vercel
- **React 19** with TypeScript strict + ESM
- **Supabase** — Postgres + Auth (magic link) + Storage (cert PDFs) + Realtime (queue updates)
- **@cantoo/pdf-lib** — active fork of pdf-lib; renders ACORD 25 via PNG-overlay because the official template is XFA-only
- **Resend** — magic-link email + cert delivery to certificate holders
- **Anthropic SDK** — reviewer agent (claude-sonnet) for first-pass cert review and dec-page extraction
- **Tailwind 4** with the "Statement" design system (see below)
- **Motion** (formerly Framer Motion) — list-staggers, row pulses, seal stamps
- **cmdk** — Cmd-K command palette as first-class navigation
- **vitest** + **pixelmatch** for cert rendering visual regression tests

## Statement — the design language

Premium civic-modern. Inter Display + JetBrains Mono. Sovereign Blue (`#0B2545`) on off-white (`#F8F8F6`). Hairline borders, no shadows-as-primary. Restrained motion (220ms ease-out default). Single saturated accent. Dark mode parity via CSS variable overrides on `[data-theme="dark"]`. Ceremonial gold reserved for "issued/verified/sealed" moments only.

Tokens live in `app/globals.css` (`@theme` block). The `tailwind.config.ts` mirrors the same set as a tooling fallback. Visit `/admin/design` (admin-only) for the full QA reference page showing every primitive in both modes.

## Local dev

```sh
npm install
npm run dev                # next dev
npm run build              # production build
npm test                   # vitest unit + cert visual diff tests
```

Cert-fill mechanic scripts (when working on the PDF renderer itself):

```sh
npm run discover-fields    # dump ACORD 25 field names to assets/acord-fields.json
npm run regen-sheffer      # generate out/sheffer-regenerated.pdf for visual diff
npm run cert-doctor        # diagnose cert rendering issues against a reference
```

## Environment

Required env vars (see `.env.local.example`):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL
ANTHROPIC_API_KEY
BRAND_AGENCY_ID                # uuid of The Policy Place agency row
REVIEWER_MODEL                 # default: claude-sonnet-4-6
ADMIN_EMAILS                   # comma-separated allow-list
APPROVAL_TOKEN_SECRET          # 32+ hex chars (HMAC for one-tap approve emails)
COI_CC_AUDIT_EMAIL             # optional audit BCC
RESEND_INBOUND_WEBHOOK_SECRET  # optional inbound email webhook auth
INBOUND_COI_ADDRESS            # public address for client cert-request emails
```

## Architecture at a glance

**Multi-tenant** from day one via `agency_id` on every client/policy/cert row. White-label ready.

**Auth model**: Supabase magic link. End-users (insureds) auth as their `contact_email`; their JWT scopes every cert/policy row to that email via RLS. Admins (Brook, Wes) check against `ADMIN_EMAILS` for elevated access; service-role bypasses RLS for server endpoints.

**Approval-first cert flow** (in `lib/certPipeline.ts`):
1. Client submits a request → cert_requests row inserted, status=`pending`
2. Reviewer agent runs (`lib/reviewerAgent.ts`) → fills `reviewer_pass`, `reviewer_flags`, `reviewer_notes` → status=`reviewed`
3. Brook approves in the queue (or auto-approve fires if the client has it on) → cert renders, status=`approved`/`edited`/`sent`
4. PDF emails to the holder with Brook's signature stamp; audit row inserted

**Cert lifecycle**: `pending → reviewed → approved/edited → sent`; `rejected` is a terminal alt-path; `voided` is a post-send recall. Every state transition writes an audit row.

**Coverage cancellation cascade**: when a policy is cancelled mid-term, `lib/affectedCerts.ts` flags every still-live cert that referenced it so Brook can void them. The `cert_requests_active_policies` view does the unnest.

**Per-client institutional memory**: `client_overrides` table accumulates Brook's "remember this for next time" notes. The reviewer agent reads active overrides for the requesting client into its prompt.

**Per-client audit trail**: `client_audit_log` table records every profile edit (field-level diff, actor email, timestamp).

## Critical implementation notes

1. **`NeedAppearances` flag is mandatory on AcroForms** — without it, filled fields render blank in Acrobat. Set on the AcroForm dict immediately after `PDFDocument.load()`.
2. **Z-order on signature stamp** — flatten the form FIRST, THEN draw the signature PNG. Drawing before flatten renders the image behind the form layer (pdf-lib issue #35).
3. **Hard expiry gate** — `lib/getClientPolicies.ts` filters `policies.exp_date >= today` server-side. Never trust client-side filtering. E&O critical.
4. **No free-text cert fields** — Cert Holder is structured name + address only. Additional Insured and Waiver of Subrogation are policy-data-driven, never client-selectable.
5. **PNG-overlay rendering, not AcroForm fill** — the official ACORD 25 is XFA-only; its AcroForm dict has zero widgets. We rasterize the template to PNG, draw it as the page background, then `page.drawText` at coordinate-mapped positions (`lib/coords.ts`). Pixel-perfect under pixelmatch diff.
6. **ACORD portal-use restrictions** — every cert is "agent-issued," not "client-generated." Brook is the actor of record. The approval-first flow exists because of this.

## Routes

- `/` — client home: identity, renewal alerts, recent certs, request form
- `/certificates` — client's full cert history
- `/result/[certNumber]` — single cert view (downloadable / shareable)
- `/verify/[certNumber]` — public QR-verifiable cert lookup
- `/login` — magic-link sign-in
- `/signup` — request access (creates an `access_requests` row for Brook to approve)
- `/admin` — admin home (bento dashboard: pending, approved this week, today's queue, renewals due, 30-day activity sparkline)
- `/admin/queue` — approval queue (rank-ordered cards, reviewer-clean items flagged Sovereign Blue)
- `/admin/queue/[id]` — cert detail (PDF preview + reviewer card + decision form)
- `/admin/clients` — client roster
- `/admin/clients/[id]` — client hub (Certificates / Policies / Profile / Audit)
- `/admin/generate` — admin-issued cert flow (alternative to client self-serve)
- `/admin/import-policy` — dec-page PDF upload (AI extracts coverages)
- `/admin/access-requests` — pending sign-up requests
- `/admin/settings` — agency, clients, automation toggles
- `/admin/design` — design system QA reference (admin-only)

## License

Private — internal to The Policy Place.
