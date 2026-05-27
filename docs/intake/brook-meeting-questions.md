# Brook Meeting — Questions to Drive the Conversation

> Wes's personal note. Goal: walk out with everything we need to onboard her forms + roster on a known timeline. Stay in business mode — push back gently if she vague-answers anything in section A or B; those are the questions that block engineering.

## A. Forms (the must-haves)

1. **Which forms do you issue today, besides ACORD 25?** Get the full list. Don't accept "the usual" — write down each form code + revision.
2. **Of those, which is most-issued by volume?** That's the one we onboard first.
3. **Are there any forms you'd LIKE to issue but currently can't because of tooling?** This is the upside list.
4. **For each form: do you have a blank ACORD template PDF on hand?** If not, we need to source.
5. **Can you share 1-3 completed sample certs per form?** Real or de-identified. Without samples, coord tuning is a guessing game.
6. **Any per-state form variants we need to know about?** (Some carriers/states require state-specific endorsements.)
7. **Multi-page forms?** ACORD 25 is one page; some others are multi.
8. **Do any forms need to be issued as part of a packet/bundle?** (e.g. ACORD 25 + ACORD 27 sent together routinely)

## B. Client Roster (the other must-have)

1. **How many active clients are we starting with?** Sets import batch expectations.
2. **What format is the roster in?** Spreadsheet (CSV/Excel)? CRM export? Paper file? Determines if we can use the bulk importer or need to hand-key.
3. **Per client: what's the typical certs-per-month pace?** Sizes the load.
4. **Per client: do they ALL use ACORD 25, or do some need different forms?** If "some need different", the roster needs `enabled_forms` per row — we have a CSV template for this.
5. **Are any of the clients already self-serving via another portal today?** Migration consideration.
6. **Any clients we should NOT onboard yet?** (Bankruptcies, disputes, pending policy gaps.)
7. **Any clients with non-standard producer info we need to override per-client?** (Sub-agencies, white-label producers.)

## C. Workflow / Approval

1. **Today, who approves each cert before it goes out?** Just Brook? Anyone else at the agency?
2. **Are there clients who should be auto-approved?** (We support `auto_approve_enabled` per client already.)
3. **What's the typical turnaround promise to clients?** (Sets SLA expectations for the queue.)
4. **Any cert types you'd want a second pair of eyes on?** (Could route by form_type to specific reviewers.)
5. **Cert delivery — email? Fax? Both? Anything else?**

## D. Edge Cases & War Stories

1. **What's the worst cert situation you've handled this year?** Reveals hidden requirements.
2. **Which holder companies are picky about exact phrasing?** Those phrasings should be pre-loaded as defaults.
3. **Any compliance/audit trails you need beyond what's already in the audit log?**
4. **How do you handle policy renewals today — proactive sweep, or reactive when a client asks?** (We have a `policy-renewals` cron route already.)

## E. Stuff to Show Her (Demo Flow)

Before the questions, do a 5-minute walkthrough — proves the system is real, sets the level of expectation:

1. Admin queue (`/admin/queue`) — pending certs, decide flow
2. Clients hub (`/admin/clients`) — list, click into one
3. Client detail tabs — certs, policies, profile (show the 100%-editable profile form)
4. Generate flow (`/admin/generate`) — pick client, select policies, render
5. Verify link (`/verify/<certNumber>`) — what holders see
6. Cert-doctor / golden tests — pitch this as "we don't ship a form until it passes 6 geometric checks AND a pixel-level regression test"

## F. Pricing / Scope Talk (Wes-only)

> Don't quote pricing. Defer all dollar questions to "we'll write up a custom proposal after the meeting." Goal here is scope, not price.

- Confirm: she's the decision-maker for adopting this portal across the agency.
- Confirm: any timeline pressure on her side? (Audits, renewal cycles.)
- Confirm: she's OK with cloud-hosted + Supabase storage for PDFs.

## G. After-Meeting Checklist (do this within 24h of the meeting)

- [ ] Drop her completed form-intake templates into `docs/intake/`
- [ ] Drop her completed client roster into `docs/intake/`
- [ ] Update the plan file with N = number of forms to onboard
- [ ] Send Brook a follow-up email summarizing what she handed over and the timeline
- [ ] Kick off Phase 4 (onboard form #1 — the highest-volume one)
