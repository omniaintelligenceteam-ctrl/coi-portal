/**
 * Master File tab — Brook's single source of truth per client.
 *
 * Surfaces every field the ACORD 25 reads from this insured plus the
 * defaults that drive the AI agent's behavior (description of operations,
 * trust-ladder thresholds). Inline editors land Brook's changes in one
 * place so she never has to touch SQL again.
 *
 * Layout:
 *   - Header: completeness meter + missing-fields list
 *   - Identity card (read-only, links to Profile tab for edits)
 *   - Defaults form (description + auto-approve thresholds)
 *   - Per-policy expanders (LimitsEditor inline per policy)
 *
 * Server component — pulls data via the parent page.tsx and renders.
 */

import Link from 'next/link';
import { Hairline } from '@/app/components/Hairline';
import { Card, EmptyState, StaticChip } from '@/app/components/ui';
import {
  scoreMasterFile,
  type ClientForMF,
  type PolicyForMF,
} from '@/lib/masterFileCompleteness';
import { ClientDefaultsForm } from './ClientDefaultsForm';
import { LimitsEditor, type LimitsEditorPolicy } from './LimitsEditor';

export function MasterFileTab({
  clientId,
  client,
  policies,
  autoApproveEnabled,
  thresholdLow,
  thresholdHigh,
}: {
  clientId: string;
  client: ClientForMF & {
    contact_email_display: string;
    address_display: string;
  };
  policies: (PolicyForMF & LimitsEditorPolicy)[];
  autoApproveEnabled: boolean;
  thresholdLow: number;
  thresholdHigh: number;
}) {
  const score = scoreMasterFile(client, policies);
  const scoreTone =
    score.score >= 90 ? 'success' : score.score >= 60 ? 'warning' : 'danger';

  const activePolicies = policies.filter(
    (p) => p.active && (p.status ?? 'active') === 'active',
  );

  return (
    <div className="space-y-12">
      {/* Completeness meter */}
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="caps text-[0.62rem] font-semibold text-brand">Master file</p>
            <h2 className="font-display mt-2 text-[1.5rem] font-medium leading-[1.15] tracking-display text-ink">
              Everything an ACORD 25 needs <span className="text-brand">in one place.</span>
            </h2>
            <p className="mt-3 max-w-[60ch] text-[0.875rem] leading-[1.55] text-ink-muted">
              Brook maintains the master file. The client signs in, picks who the cert is for and
              which coverages to include. The agent and the cert pipeline pull everything else from
              here.
            </p>
          </div>
          <CompletenessMeter score={score.score} tone={scoreTone} />
        </div>

        {score.missing.length > 0 && (
          <Card padding="md" tone={scoreTone === 'success' ? 'default' : scoreTone} className="mt-6">
            <p className="caps text-[0.62rem] font-semibold text-ink-faint">
              Missing — {score.missing.length} item{score.missing.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-[0.85rem] text-ink sm:grid-cols-2">
              {score.missing.slice(0, 12).map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="caps mt-0.5 inline-flex shrink-0 items-center rounded-[3px] border border-hairline-strong px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink-faint">
                    {m.area}
                  </span>
                  <span>{m.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Identity */}
      <div>
        <Hairline label="Identity" />
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <ReadOnlyField label="Business name" value={client.business_name ?? '—'} />
          <ReadOnlyField label="Contact email" value={client.contact_email_display} mono />
          <ReadOnlyField label="Mailing address" value={client.address_display} />
          <ReadOnlyField label="Phone" value={client.phone || '—'} mono />
        </div>
        <p className="mt-4 text-[0.78rem] text-ink-faint">
          Edit identity fields on the{' '}
          <Link
            href={`/admin/clients/${clientId}?tab=profile`}
            className="focus-ring -m-1 rounded p-1 font-medium text-brand-deep underline-offset-2 hover:underline"
          >
            Profile tab
          </Link>
          .
        </p>
      </div>

      {/* Defaults */}
      <div>
        <Hairline label="Defaults" />
        <div className="mt-5">
          <ClientDefaultsForm
            clientId={clientId}
            initial={{
              defaultDescription: client.default_description ?? '',
              autoApproveEnabled,
              autoApproveThresholdLow: thresholdLow,
              autoApproveThresholdHigh: thresholdHigh,
            }}
          />
        </div>
      </div>

      {/* Policies + limits editors */}
      <div>
        <Hairline label={`Policies & limits — ${activePolicies.length} active`} />
        <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-[1.55] text-ink-muted">
          Click any policy to inline-edit limits, additional insured / waiver of subrogation flags,
          and the policy description. Required fields are marked with an asterisk.
        </p>
        {activePolicies.length === 0 ? (
          <div className="mt-5">
            <EmptyState
              eyebrow="No policies on file"
              title="Add a policy to start"
              description="Import a dec page from the Admin → Generate flow, or add policies manually."
              tone="default"
            />
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {activePolicies.map((p) => (
              <LimitsEditor key={p.id} policy={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompletenessMeter({
  score,
  tone,
}: {
  score: number;
  tone: 'success' | 'warning' | 'danger';
}) {
  const ringColor =
    tone === 'success' ? 'var(--color-success)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)';
  const dash = (score / 100) * 100;

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          stroke={ringColor}
          strokeWidth="3"
          strokeDasharray={`${dash} 100`}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className="num-tabular font-display text-[2.25rem] font-medium leading-[1] text-ink">
          {score}%
        </p>
        <p className="caps mt-1 text-[0.6rem] font-semibold text-ink-faint">complete</p>
      </div>
    </div>
  );
}

function ReadOnlyField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="caps text-[0.6rem] font-semibold text-ink-faint">{label}</p>
      <p
        className={[
          'mt-1 text-[0.95rem] leading-[1.4] text-ink',
          mono ? 'font-mono text-[0.875rem]' : '',
        ].join(' ')}
      >
        {value}
      </p>
    </div>
  );
}
