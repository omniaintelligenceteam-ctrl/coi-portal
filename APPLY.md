# COI Portal — Phase 1 bundle (deep client editing + audit trail)

This bundle is the first phase of the world-class plan. It expands the client profile editor from 3 fields to 9, soft-archives instead of hard-deletes, and records every change in a tamper-evident audit log.

## What's in here

```
supabase/migrations/
  20260520_0003_client_profile_expansion.sql        # new

lib/
  clientAuditLog.ts                                  # new

app/api/admin/
  update-client/route.ts                             # MODIFIED — expanded fields + audit
  archive-client/route.ts                            # new

app/admin/clients/[clientId]/
  page.tsx                                           # MODIFIED — added Audit tab + agency fetch
  ProfileForm.tsx                                    # MODIFIED — full rewrite with sections
  ArchiveClientButton.tsx                            # new
  AuditLogPanel.tsx                                  # new
```

## Apply

From the root of the `coi-portal` checkout:

1. Unzip this bundle into the repo root. File paths are already correct relative to the project root — they'll overwrite the modified files and add the new ones.
2. Apply the migration:
   ```sh
   # Local dev (Supabase CLI)
   supabase db push
   # Or on a remote project:
   supabase db push --linked
   ```
   The migration is idempotent on a fresh run but is NOT designed to re-run after partial application. If something fails partway, drop the new objects and re-run.
3. Restart the dev server (or redeploy).

No new environment variables are required. No new dependencies added.

## What changed at a glance

**Schema (`20260520_0003_client_profile_expansion.sql`)**
- `coi_clients` gains `contact_name`, `phone`, `archived_at`, `archived_reason`
- New table `client_audit_log` (append-only, service-role only, no RLS policies = nobody sees rows except service role)
- Check constraint enforces `archived_at IS NULL` OR `(archived_at IS NOT NULL AND active = false)`
- Partial index on active clients for the dominant roster query

**API (`/api/admin/update-client`)**
- Accepts `businessName, businessAddress1, businessAddress2, contactName, contactEmail, phone, agencyId, active`
- Email validated client-side AND server-side via zod
- Reads the current row, computes a per-field diff, applies the update, writes the diff to `client_audit_log`
- Agency changes get their own audit action label (`transferred`) so the timeline reads cleanly
- Audit write is best-effort — if it fails, the update still lands and a `warn` is logged for reconciliation

**API (`/api/admin/archive-client`) — new**
- Single endpoint for both archive and restore
- Archive: sets `archived_at`, `archived_reason`, flips `active=false`
- Restore: clears archive fields, flips `active=true`
- Audit log records the action with the reason note

**ProfileForm — full rewrite**
- Sections: Identity, Contact, Mailing address, Operations
- Uses the proper UI primitives (`Input`, `Button`, `Toggle`, `Banner`) instead of raw inputs — consolidates the design system that already existed
- Zod validation on the client side, mirroring server validation, with per-field error messages
- Dirty-state tracking, sonner toast on save, disabled when archived
- Archive/restore action lives in the form footer alongside Save
- Auto-approve toggle (existing `ClientAutoApproveToggle`) is embedded inline in Operations

**Client hub page**
- New `Audit` tab listing the most recent 100 audit log entries (newest first), with action + actor + per-field diff + optional note
- Header shows an `Archived` or `Inactive` pill when applicable
- Fetches the agency list in parallel so the form can offer transfer
- Audit data is only loaded when the Audit tab is active — small win on the dominant Certificates load path

## What to test

Quick smoke pass:

- [ ] Profile tab: edit business name, save → toast appears, the change shows in the Audit tab
- [ ] Profile tab: edit contact_email to an invalid format → field error appears, no server call made
- [ ] Profile tab: save with no changes → button stays disabled
- [ ] Profile tab: toggle Active off, save → "Inactive" pill appears in the header
- [ ] Archive: click "Archive client…", enter reason, confirm → header shows "Archived" pill, the Profile tab fields are disabled, banner shows the archived reason
- [ ] Audit: confirm the archive action appears with the reason
- [ ] Restore: click "Restore client" → pill disappears, fields editable again
- [ ] Audit tab: diffs show old → new for each changed field
- [ ] Auto-approve toggle still works (it's its own fire-and-forget endpoint, unchanged)
- [ ] Existing flows: cert generation, queue, void, cancel coverage — all untouched

## Known gaps (handled in later phases)

- Audit log is admin-only — no pagination yet, hard limit of 100 newest entries
- Agency dropdown uses an HTML `<datalist>` instead of a proper combobox (works, but not visually as nice as a custom one — will upgrade in polish phase)
- Changing `contact_email` doesn't currently re-key the magic-link auth identity. If a client signs in with their old email and you've changed it, they'll lose access to their own dashboard. Either tell them their new login email, or wait for Phase 3 which adds a proper email-change confirmation flow.
- Phone is stored as free text — no E.164 normalization yet
- No multi-tenant signup yet (white-label) — that's a stretch goal

## What's next

Phase 2 (the keystone): per-client form-builder + tailored CoverageForm. Brook configures each client's form once via dropdowns; the insured sees only their tailored fields with their defaults pre-filled. That's the change clients will actually feel.
