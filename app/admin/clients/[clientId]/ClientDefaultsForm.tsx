'use client';

/**
 * Per-client defaults editor — Master File workstream.
 *
 * Two related things land here:
 *   1. default_description     — Brook's default description of operations,
 *                                merged into every cert request that doesn't
 *                                override it per-cert.
 *   2. auto_approve_threshold_low / _high — the trust-ladder knobs. Each
 *      insured carries their own bar; default 70 / 90 from the migration.
 *
 * Posts a single PATCH to /api/admin/update-client. Same audit-logging path
 * the Profile edits use, so threshold tweaks show up in /admin/clients/[id]
 * under the Audit tab.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Hairline } from '@/app/components/Hairline';
import { Banner, Button, Input, Textarea } from '@/app/components/ui';

export type DefaultsInitial = {
  defaultDescription: string;
  autoApproveEnabled: boolean;
  autoApproveThresholdLow: number;
  autoApproveThresholdHigh: number;
};

export function ClientDefaultsForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: DefaultsInitial;
}) {
  const router = useRouter();
  const [defaultDescription, setDefaultDescription] = useState(initial.defaultDescription);
  const [low, setLow] = useState(initial.autoApproveThresholdLow);
  const [high, setHigh] = useState(initial.autoApproveThresholdHigh);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    defaultDescription !== initial.defaultDescription ||
    low !== initial.autoApproveThresholdLow ||
    high !== initial.autoApproveThresholdHigh;

  const thresholdInvalid = low > high;

  async function handleSave() {
    if (thresholdInvalid) {
      setError('Low threshold must be ≤ high threshold.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          defaultDescription,
          autoApproveThresholdLow: low,
          autoApproveThresholdHigh: high,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        const message = payload.detail || payload.error || `Request failed (${res.status}).`;
        setError(message);
        toast.error(message);
        return;
      }
      toast.success('Defaults saved.');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Hairline label="Default description of operations" />
        <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-[1.55] text-ink-muted">
          When a cert request doesn't specify a description per-cert, this is what prints in the
          Description of Operations / Locations / Vehicles box on the ACORD 25. The reviewer agent
          and the chat assistant fall back to it too.
        </p>
        <div className="mt-4 max-w-2xl">
          <Textarea
            label="Description"
            rows={3}
            value={defaultDescription}
            onChange={(e) => setDefaultDescription(e.target.value)}
            placeholder="e.g. Construction services performed by the named insured. Project-specific endorsements apply per certificate."
            hint="Plain text. Will be wrapped automatically on the cert."
            maxLength={2000}
          />
        </div>
      </div>

      <div>
        <Hairline label="Auto-approve thresholds" />
        <p className="mt-3 max-w-[60ch] text-[0.8125rem] leading-[1.55] text-ink-muted">
          The reviewer agent scores each cert from 0 to 100. Scores below the LOW bar route to the
          manual queue. Between LOW and HIGH the cert auto-approves after a 1-hour holdback (you
          can intercept). At or above HIGH the cert auto-approves immediately. Default 70 / 90 with
          per-client graduation.
        </p>
        <p className="mt-2 max-w-[60ch] text-[0.8125rem] leading-[1.55] text-ink-faint">
          {!initial.autoApproveEnabled && (
            <>
              Note: <strong>Auto-approve is currently OFF</strong> for this client. Thresholds save but
              don't fire until you flip auto-approve on (Profile tab).
            </>
          )}
        </p>
        <div className="mt-5 grid max-w-md grid-cols-2 gap-5">
          <Input
            label="Low threshold"
            type="number"
            min={0}
            max={100}
            value={low}
            onChange={(e) => setLow(clampInt(e.target.value, 0, 100))}
            hint="Below this → manual"
            error={thresholdInvalid ? 'Must be ≤ high' : undefined}
          />
          <Input
            label="High threshold"
            type="number"
            min={0}
            max={100}
            value={high}
            onChange={(e) => setHigh(clampInt(e.target.value, 0, 100))}
            hint="At or above → instant"
            error={thresholdInvalid ? 'Must be ≥ low' : undefined}
          />
        </div>
        <p className="mt-4 max-w-[60ch] text-[0.78rem] leading-[1.5] text-ink-faint">
          Tip — raise both thresholds for clients you're still learning. As you watch certs auto-
          issue cleanly, dial them down. New clients start at the default 70 / 90.
        </p>
      </div>

      {error && (
        <Banner tone="danger">{error}</Banner>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-hairline pt-6">
        {dirty && (
          <span className="caps text-[0.6rem] font-semibold text-ink-faint">Unsaved</span>
        )}
        <Button onClick={handleSave} disabled={!dirty || thresholdInvalid} loading={submitting}>
          Save defaults
        </Button>
      </div>
    </div>
  );
}

function clampInt(raw: string, lo: number, hi: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
