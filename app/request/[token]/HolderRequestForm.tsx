'use client';

import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Banner, Button, Input } from '@/app/components/ui';

export function HolderRequestForm({
  token,
  businessName,
}: {
  token: string;
  businessName: string;
}) {
  const [holderName, setHolderName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const canSubmit =
    holderName.trim().length > 0 &&
    address1.trim().length > 0 &&
    /.+@.+\..+/.test(email.trim()) &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/holder-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          token,
          holderName: holderName.trim(),
          holderAddress1: address1.trim(),
          holderAddress2: address2.trim(),
          requesterEmail: email.trim(),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reference?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error || `Request failed (${res.status}). Please try again.`);
        return;
      }
      setReference(payload.reference ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (reference) {
    return (
      <div className="border border-success/30 bg-success-soft/30 px-6 py-8">
        <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-success">
          Request received
        </p>
        <h2 className="mt-3 font-display text-[1.5rem] font-medium leading-[1.2] text-ink">
          You&apos;re in the queue.
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-[1.6] text-ink-muted">
          Reference <span className="font-mono font-semibold text-ink">{reference}</span>. The
          certificate will be issued to <strong className="text-ink">{holderName}</strong> and
          delivered through {businessName} — usually the same business day. Keep the reference
          number in case you need to follow up.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Certificate holder (your company) *"
        value={holderName}
        onChange={(e) => setHolderName(e.target.value)}
        placeholder="e.g. Sheffer Construction LLC"
        maxLength={200}
        required
      />
      <Input
        label="Holder address *"
        value={address1}
        onChange={(e) => setAddress1(e.target.value)}
        placeholder="Street address"
        maxLength={200}
        required
      />
      <Input
        label="Address line 2"
        value={address2}
        onChange={(e) => setAddress2(e.target.value)}
        placeholder="City, State ZIP"
        maxLength={200}
      />
      <Input
        label="Your email *"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        maxLength={200}
        hint="Used only to follow up on this request."
        required
      />

      {error && <Banner tone="danger">{error}</Banner>}

      <div className="pt-2">
        <Button
          type="submit"
          size="lg"
          disabled={!canSubmit}
          loading={submitting}
          trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          className="w-full sm:w-auto"
        >
          Request certificate
        </Button>
      </div>
    </form>
  );
}
