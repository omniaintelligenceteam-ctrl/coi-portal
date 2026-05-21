/**
 * Audit log panel for a client.
 *
 * Renders rows from client_audit_log newest-first. Each row shows:
 *   - The action (updated / archived / restored / transferred)
 *   - The actor (admin email)
 *   - The timestamp
 *   - For 'updated' and 'transferred', the per-field diff (from → to)
 *   - For 'archived', any reason note
 *
 * Server component — reads via the admin client (bypasses RLS) and renders
 * static HTML. No client-side interactivity yet (planned: filter by actor,
 * filter by date range).
 */

import { Hairline } from '@/app/components/Hairline';
import { EmptyState } from '@/app/components/ui';

export type AuditLogEntry = {
  id: string;
  action: 'updated' | 'archived' | 'restored' | 'transferred' | string;
  actor_email: string;
  diff: Record<string, { from: string | boolean | null; to: string | boolean | null }>;
  note: string | null;
  created_at: string;
};

// Map DB column names to human labels. Anything not in the map renders as-is.
const FIELD_LABELS: Record<string, string> = {
  business_name: 'Business name',
  business_address1: 'Address line 1',
  business_address2: 'Address line 2',
  contact_name: 'Contact name',
  contact_email: 'Contact email',
  phone: 'Phone',
  agency_id: 'Agency',
  active: 'Active',
};

const ACTION_LABELS: Record<string, string> = {
  updated: 'Profile updated',
  archived: 'Client archived',
  restored: 'Client restored',
  transferred: 'Agency transferred',
};

const ACTION_TONE: Record<string, string> = {
  updated: 'text-ink-muted',
  archived: 'text-danger',
  restored: 'text-success',
  transferred: 'text-seal-deep',
};

export function AuditLogPanel({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        description="Profile changes, archive actions, and agency transfers will appear here once anyone edits this client."
      />
    );
  }

  return (
    <div className="space-y-6">
      <Hairline label={`History (${entries.length})`} />
      <ol className="space-y-5">
        {entries.map((entry) => (
          <li key={entry.id} className="border-l-2 border-hairline pl-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p
                className={`caps text-[0.65rem] font-semibold tracking-[0.18em] ${
                  ACTION_TONE[entry.action] ?? 'text-ink-muted'
                }`}
              >
                {ACTION_LABELS[entry.action] ?? entry.action}
              </p>
              <p className="font-mono text-[0.72rem] text-ink-faint">
                {formatTimestamp(entry.created_at)}
              </p>
            </div>
            <p className="mt-1 text-[0.8rem] text-ink-muted">
              by{' '}
              <span className="font-mono text-[0.78rem] text-ink">{entry.actor_email}</span>
            </p>
            {Object.keys(entry.diff).length > 0 && (
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(entry.diff).map(([field, change]) => (
                  <div key={field}>
                    <dt className="caps text-[0.6rem] font-medium text-ink-faint">
                      {FIELD_LABELS[field] ?? field}
                    </dt>
                    <dd className="mt-0.5 text-[0.8rem] text-ink">
                      <span className="text-ink-faint line-through">{formatValue(change.from)}</span>
                      <span className="mx-2 text-ink-faint">→</span>
                      <span className="font-medium text-ink">{formatValue(change.to)}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {entry.note && (
              <p className="mt-3 border-l-2 border-hairline pl-3 text-[0.78rem] italic text-ink-muted">
                {entry.note}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatValue(v: string | boolean | null): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  return v;
}
