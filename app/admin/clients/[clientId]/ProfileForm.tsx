'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Hairline } from '@/app/components/Hairline';

type Initial = {
  businessName: string;
  businessAddress1: string;
  businessAddress2: string;
};

export function ProfileForm({
  clientId,
  initial,
}: {
  clientId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initial.businessName);
  const [businessAddress1, setBusinessAddress1] = useState(initial.businessAddress1);
  const [businessAddress2, setBusinessAddress2] = useState(initial.businessAddress2);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    businessName !== initial.businessName ||
    businessAddress1 !== initial.businessAddress1 ||
    businessAddress2 !== initial.businessAddress2;

  async function handle() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          businessName,
          businessAddress1,
          businessAddress2,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.detail || payload.error || `Request failed (${res.status})`);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Hairline label="Insured profile" />
      <div className="mt-6 space-y-5 max-w-xl">
        <Field
          id="biz-name"
          label="Business name"
          value={businessName}
          onChange={setBusinessName}
        />
        <Field
          id="biz-addr1"
          label="Address line 1"
          value={businessAddress1}
          onChange={setBusinessAddress1}
        />
        <Field
          id="biz-addr2"
          label="Address line 2"
          value={businessAddress2}
          onChange={setBusinessAddress2}
        />
      </div>

      {error && (
        <p className="mt-4 border-l-2 border-danger pl-3 text-[0.78rem] text-danger">{error}</p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={handle}
          disabled={submitting || !dirty}
          className="focus-ring inline-flex items-center rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && !dirty && (
          <span className="caps text-[0.6rem] font-semibold text-success">Saved</span>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="caps block text-[0.62rem] font-semibold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-underline mt-2 block w-full text-base text-ink"
      />
    </div>
  );
}
