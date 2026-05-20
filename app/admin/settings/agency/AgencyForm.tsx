'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Initial = {
  name: string;
  address1: string;
  address2: string;
  contactName: string;
  phone: string;
  fax: string;
  email: string;
  licenseNo: string;
};

export function AgencyForm({
  agencyId,
  initial,
}: {
  agencyId: string;
  initial: Initial;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Initial>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    form.name !== initial.name ||
    form.address1 !== initial.address1 ||
    form.address2 !== initial.address2 ||
    form.contactName !== initial.contactName ||
    form.phone !== initial.phone ||
    form.fax !== initial.fax ||
    form.email !== initial.email ||
    form.licenseNo !== initial.licenseNo;

  async function handle() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/update-agency', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agencyId, ...form }),
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
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field id="ag-name" label="Agency name" value={form.name} onChange={(v) => setForm((s) => ({ ...s, name: v }))} />
        <Field id="ag-license" label="License #" value={form.licenseNo} onChange={(v) => setForm((s) => ({ ...s, licenseNo: v }))} />
        <Field id="ag-addr1" label="Address line 1" value={form.address1} onChange={(v) => setForm((s) => ({ ...s, address1: v }))} />
        <Field id="ag-addr2" label="Address line 2" value={form.address2} onChange={(v) => setForm((s) => ({ ...s, address2: v }))} />
        <Field id="ag-contact" label="Contact name" value={form.contactName} onChange={(v) => setForm((s) => ({ ...s, contactName: v }))} />
        <Field id="ag-phone" label="Phone" value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} />
        <Field id="ag-fax" label="Fax" value={form.fax} onChange={(v) => setForm((s) => ({ ...s, fax: v }))} />
        <Field id="ag-email" label="Email" value={form.email} onChange={(v) => setForm((s) => ({ ...s, email: v }))} />
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
