# COI Portal — World-Class Roadmap & Competitive Positioning

> **Status (2026-07-13):** Tier 1 SHIPPED (#1 renewal reissue, #2 delivery ledger,
> #3 safety migrations, #4 ROI tiles, #5 holder self-serve link). Tier 2 SHIPPED
> (#6 requirements engine + P&NC, #7 holder CRM, #8 full renewal automation,
> #10 health endpoint + trust-ladder/webhook tests — Sentry pending vendor decision).
> Blocked/pending: #9 needs an ACORD 24/27 source PDF (licensed asset);
> Resend webhook needs RESEND_WEBHOOK_SECRET set in Vercel; Tier 3 (#11–14)
> awaits business greenlight (AMS partner apps, white-label architecture,
> holder-side product, outbound event infra).

## Context

Wes asked: what makes this app world-class, and what features make it a no-brainer buy for the client (Brook / PolicyPlace, and agencies like her)? Full built-vs-stubbed audit completed first (three parallel codebase sweeps: app surface, cert pipeline, data model/tooling).

**Audit verdict: this is NOT an MVP.** Zero stubs or TODOs found in `app/`. What's already built and production-grade:

- **5-channel intake** (email webhook w/ DMARC anti-spoofing, Twilio SMS, in-app AI chat, web form, Bearer-key API) with two-stage LLM parsing — `app/api/inbound/coi-request/route.ts`, `lib/classifyInbound.ts`, `lib/parseInboundCoi.ts`
- **Graduated trust ladder** — AI reviewer confidence → manual / 1-hr holdback / instant lanes, with intercept button — `lib/reviewerAgent.ts`, `lib/laneDecision.ts`
- **One-tap phone approval** via single-use HMAC email tokens — `lib/approvalToken.ts`, `app/approve/[id]/`
- **Public QR verify page** with tamper-evident checksums — `app/verify/[certNumber]/page.tsx`
- **Visual form mapper** + data-driven renderer + pixel-parity test harness — `app/admin/forms/`, `lib/forms/`
- Learned corrections per client (`client_overrides`), master-file completeness scoring, audit trails ×3, atomic cert numbering

**The gaps that stand between "impressive demo" and "no-brainer purchase":** renewal automation (warnings only, no reissue), holder-requirements matching (endorsements are pass-through booleans; Primary & Noncontributory isn't modeled at all), AMS integration (policy data is manually entered), single-tenant hardcoding despite multi-agency schema, no outbound delivery tracking, and two known data-safety landmines drafted but unapplied (`supabase/migrations/_proposals/D2` cert-number race, `D5` agency cascade-delete blast radius).

## Positioning statement

**"The COI desk that runs itself: any request — email, text, or chat — becomes a verified, QR-provable ACORD 25 in under a minute, and Brook only touches the ones that actually need her."**

Competitor frame: myCOI/Certificial/TrustLayer sell COI *tracking* to the certificate-holder side (GCs, property managers) at enterprise prices. AMS built-ins (EZLynx, HawkSoft) issue certs but with zero intelligence — no intake parsing, no AI review, no verify page. Nobody sells the *agency side* an autonomous COI desk. That's the wedge.

## Tier 1 — Quick Wins (1–2 sprints)

| # | Client problem | Solution | Competitor alternative | Implementation notes |
|---|---|---|---|---|
| 1 | Renewal season = re-typing every live cert | **One-click "reissue all live certs" on policy renewal** | Manual re-issue in AMS, one at a time | `lib/affectedCerts.ts` + `cert_requests_active_policies` view already find live certs per policy; wire to `ReissueButton` logic in a batch action w/ new dates |
| 2 | "Did the holder actually get it?" (E&O exposure) | **Outbound delivery ledger** — store Resend message id, add bounce/delivered webhook, show status on cert detail | Nothing — agencies forward and pray | `lib/email.ts` already returns `emailId`, just not persisted; new `outbound_log` table + webhook route mirroring `inbound_email_log` |
| 3 | Data-safety landmines | **Apply D2 (atomic cert-number RPC) + D5 (cascade→restrict)** migrations | n/a — trust table stakes | Both already drafted in `supabase/migrations/_proposals/`; D2 backfill half already applied |
| 4 | Brook can't prove ROI | **Dashboard ROI tiles**: certs auto-issued %, avg request→sent time, est. hours saved | myCOI reports (holder-side only) | Data already in `cert_requests` timestamps + `auto_approve_lane`; extend `app/admin/page.tsx` bento |
| 5 | Holders chase the insured for certs | **Holder self-serve request link** — public magic link per client that files a request into the existing queue | Phone calls and email chains | Reuse `app/api/generate-coi` intake + `access_requests` pattern; no new pipeline needed |

## Tier 2 — Medium (1–2 months)

| # | Client problem | Solution | Competitor alternative | Implementation notes |
|---|---|---|---|---|
| 6 | Holder contracts demand specific limits/endorsements; mismatches = E&O claims | **Requirements engine**: model holder requirements (limits, AI, WoS, **P&NC**), deterministic requested-vs-carried check feeding the reviewer | TrustLayer/Certificial do this holder-side at enterprise price | New `holder_requirements` table; deterministic rules layer under `reviewerAgent.ts` so confidence stops being purely an LLM number; add P&NC field to `policies` + render slot |
| 7 | Holders are just strings on certs | **Holder CRM**: first-class holder entities w/ contact emails, "all certs held" view, direct holder delivery | AMS contact records (disconnected from certs) | Promote `cert_holders` from autocomplete cache to entity; FK from `cert_requests` |
| 8 | Renewal still semi-manual after Tier 1 | **Full renewal automation**: policy renews → certs auto-roll through the existing trust ladder → holders re-notified, with `renewals` state table (sent/renewed/lapsed) | Nobody automates this end-to-end | Builds on #1 + #2; run through `laneDecision` so instant-lane clients renew hands-free |
| 9 | Only ACORD 25 supported | **Ship form #2** (ACORD 24 Evidence of Property or ACORD 27) via the already-built visual mapper | AMS supports many forms, dumbly | Registry (`lib/forms/registry.ts`) is N-form ready; proves the mapper investment and the "any form" sales claim |
| 10 | Silent failures in prod | **Sentry + API-route tests + health endpoint** — none of the 37 API routes have tests today | n/a | Focus on approval-token consumption, inbound webhooks, cron auth |

## Tier 3 — Long-term Bets (3–6 months)

| # | Client problem | Solution | Competitor alternative | Implementation notes |
|---|---|---|---|---|
| 11 | Policy data is hand-entered | **AMS sync** (EZLynx / HawkSoft / Applied APIs) — policies flow in automatically | Native AMS cert issuance (dumb but integrated) | The Claude dec-page extractor (`app/api/admin/extract-policy`) is the bridge until real API access; AMS APIs are gatekept — start partner apps early |
| 12 | One agency = one sale | **White-label multi-agency SaaS** | myCOI et al. don't serve small agencies at all | Schema is ready (`agencies`, `agency_id` FKs); needs agency-scoped RLS, roles table (replace `ADMIN_EMAILS` env), per-agency branding/signature (de-hardcode `assets/policy-place-signature.png`, Brook's contact info, `wesoverstreet@gmail.com` CC) |
| 13 | Holder side is the bigger market | **Compliance monitoring for holders**: GCs/property managers track incoming certs, auto-flag expirations — the QR verify page is the trojan horse | myCOI/Certificial (enterprise-priced) | Every verified cert exposes holders to the platform; land-and-expand from the verify page |
| 14 | Agents want machine access | **Agent-native ecosystem**: expand `api/v1/certificates` + outbound webhooks so client tools/AI agents request certs programmatically | Nobody | v1 API already exists with Bearer auth; add outbound events + docs |

## The demo one-two punch (sales framing)

1. Text the demo number a COI request → cert arrives, verified, in ~60 seconds.
2. Scan the QR on the PDF → live verify page with the animated seal.
3. Show the queue: "You only see the 10% the AI wasn't sure about — and you approve those from your phone."

## Verification / next steps if greenlit

- Tier picks become individual implementation plans (each Tier-1 item is a 1–3 day surgical change; #1, #3, #4 are nearly pure wiring of existing code).
- Done-checks per item are concrete: #1 = renewed policy batch-reissues N live certs in one click; #2 = cert detail shows "Delivered ✓" from a real Resend webhook; #3 = `supabase migration list` shows D2/D5 applied + concurrent-submit test passes.
- Deliverable file `roadmap_competitive_positioning.md` can be dropped in the repo root (or wherever Wes wants) once approved — content above is the draft.
