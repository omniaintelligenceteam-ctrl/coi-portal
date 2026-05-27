'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check } from 'lucide-react';
import { Banner, Card, Section, StaticChip, Toggle } from '@/app/components/ui';

/**
 * Per-client form enablement tab. Renders one Toggle row per registered form.
 * The toggle persists to coi_clients.enabled_forms via the
 * /api/admin/clients/[id]/forms POST route.
 *
 * Optimistic UI: flip immediately, roll back on failure with a Banner. We
 * keep one "in-flight" formId at a time — Brook isn't going to mass-toggle
 * a hundred forms, so per-row serialization is fine and keeps the audit log
 * tidy.
 */

export type RegisteredFormSummary = {
  id: string;
  displayName: string;
  revision: string;
};

export function FormsTab({
  clientId,
  clientName,
  forms,
  initialEnabled,
}: {
  clientId: string;
  clientName: string;
  forms: RegisteredFormSummary[];
  initialEnabled: string[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState<Set<string>>(new Set(initialEnabled));
  const [pending, startTransition] = useTransition();
  const [inFlightFormId, setInFlightFormId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(formId: string, next: boolean) {
    setError(null);
    setInFlightFormId(formId);

    // Optimistic update — flip the local set first so the toggle animates.
    setEnabled((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(formId);
      else updated.delete(formId);
      return updated;
    });

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/forms`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formId, enabled: next }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        // Roll back optimistic change
        setEnabled((prev) => {
          const reverted = new Set(prev);
          if (next) reverted.delete(formId);
          else reverted.add(formId);
          return reverted;
        });
        setError(payload.detail ?? payload.error ?? `Request failed (${res.status})`);
        return;
      }

      // Soft refresh so the surrounding page (Forms Library counts, recent certs)
      // picks up the new state without a full reload.
      startTransition(() => router.refresh());
    } catch (err) {
      setEnabled((prev) => {
        const reverted = new Set(prev);
        if (next) reverted.delete(formId);
        else reverted.add(formId);
        return reverted;
      });
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setInFlightFormId(null);
    }
  }

  return (
    <div className="space-y-10">
      <Section
        eyebrow="Forms"
        title="What can this client request?"
        description={`Toggle on the forms ${clientName} should see in their portal picker. Off-toggled forms are hidden from the client but still visible to admins.`}
        bare
      >
        {error && (
          <Banner tone="danger" title="Couldn't save change" className="mb-5">
            {error}
          </Banner>
        )}

        <Card padding="none" bordered>
          <ul className="divide-y divide-hairline">
            {forms.map((form) => {
              const isOn = enabled.has(form.id);
              const isInFlight = inFlightFormId === form.id;
              return (
                <li key={form.id} className="px-5 py-5 sm:px-6 sm:py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h3 className="text-[1rem] font-medium leading-[1.3] text-ink">
                          {form.displayName}
                        </h3>
                        <span className="caps font-mono text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint">
                          {form.id.replace('_', ' ')} · {form.revision}
                        </span>
                        {isOn && (
                          <StaticChip
                            tone="success"
                            leadingIcon={<Check className="h-3 w-3" aria-hidden="true" />}
                          >
                            Enabled
                          </StaticChip>
                        )}
                      </div>
                      <p className="mt-2 text-[0.8125rem] leading-[1.55] text-ink-muted">
                        {isOn
                          ? `${clientName} will see this form as a choice when requesting a certificate.`
                          : `Hidden from ${clientName}. Toggle on to let them request this form.`}
                      </p>
                    </div>
                    <div className="shrink-0 pt-1">
                      <Toggle
                        size="md"
                        checked={isOn}
                        disabled={pending || isInFlight}
                        onChange={(e) => toggle(form.id, e.target.checked)}
                        aria-label={`${isOn ? 'Disable' : 'Enable'} ${form.displayName} for ${clientName}`}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </Section>

      <Section
        eyebrow="—"
        title="Adding new forms"
        description="The library lives at /admin/forms — it lists every form the portal can render. Adding a brand-new form (e.g., ACORD 27) is engineering work; once registered there, you can flip it on for this client from the toggles above."
      >
        <Card padding="md" surface="sunken">
          <p className="text-[0.875rem] leading-[1.55] text-ink-muted">
            <AlertCircle
              className="-mt-0.5 mr-1.5 inline h-4 w-4 text-ink-faint"
              aria-hidden="true"
            />
            ACORD 25 is on by default for every client. Toggling it off would prevent {clientName}{' '}
            from issuing any certificate — only do this if you really mean to suspend their access.
          </p>
        </Card>
      </Section>
    </div>
  );
}
