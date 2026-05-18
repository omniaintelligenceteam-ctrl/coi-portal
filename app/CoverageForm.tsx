'use client';

import { useState, type FormEvent } from 'react';

export type PolicyForForm = {
  id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policyNumber: string;
  effDate: string;
  expDate: string;
  insurerName: string;
  addlInsuredBlanket: boolean;
  subrogationWaived: boolean;
  description: string;
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; certNumber: string }
  | { kind: 'error'; message: string };

const TYPE_LABEL: Record<PolicyForForm['type'], string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

const TYPE_BADGE: Record<PolicyForForm['type'], string> = {
  GL: 'bg-blue-100 text-blue-700',
  WC: 'bg-orange-100 text-orange-700',
  AUTO: 'bg-purple-100 text-purple-700',
  UMBRELLA: 'bg-indigo-100 text-indigo-700',
  EQUIPMENT: 'bg-slate-100 text-slate-600',
  OTHER: 'bg-gray-100 text-gray-600',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

export function CoverageForm({
  clientId,
  policies,
}: {
  clientId: string;
  policies: PolicyForForm[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(policies.map((p) => p.id)),
  );
  const [holderName, setHolderName] = useState('');
  const [holderAddress1, setHolderAddress1] = useState('');
  const [holderAddress2, setHolderAddress2] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });

  function togglePolicy(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.size === 0) {
      setState({ kind: 'error', message: 'Select at least one coverage to include.' });
      return;
    }
    setState({ kind: 'submitting' });
    try {
      const res = await fetch('/api/generate-coi', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          selectedPolicyIds: Array.from(selected),
          holder: {
            name: holderName.trim(),
            address1: holderAddress1.trim(),
            address2: holderAddress2.trim(),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setState({ kind: 'error', message: text || `Request failed (${res.status}).` });
        return;
      }
      const json = (await res.json()) as { certNumber?: string };
      setState({ kind: 'success', certNumber: json.certNumber ?? 'pending' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error.' });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-7 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100 mb-4">
          <CheckIcon className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="font-semibold text-green-900 text-base">Request submitted</h3>
        <p className="mt-2 text-sm text-green-800 leading-relaxed">
          Your request{' '}
          <span className="font-mono font-semibold bg-green-100 px-1.5 py-0.5 rounded">
            {state.certNumber}
          </span>{' '}
          has been queued for Brook&apos;s review. You&apos;ll receive an email with the certificate
          attached once it clears review (usually within a few business hours).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Step 1: Coverages */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={1} />
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Select coverages</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              All in-force policies are included by default.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {policies.map((p) => {
            const isSelected = selected.has(p.id);
            return (
              <label
                key={p.id}
                className={`flex items-start gap-4 rounded-xl border p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-kyblue-400 bg-kyblue-50 ring-1 ring-kyblue-300'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => togglePolicy(p.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-kyblue-500 focus:ring-kyblue-400"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">
                      {TYPE_LABEL[p.type]}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_BADGE[p.type]}`}
                    >
                      {p.type}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.insurerName} · Policy {p.policyNumber}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {formatDate(p.effDate)} — {formatDate(p.expDate)}
                  </p>
                  {(p.addlInsuredBlanket || p.subrogationWaived || p.description) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.addlInsuredBlanket && (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Additional Insured: blanket
                        </span>
                      )}
                      {p.subrogationWaived && (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Waiver of Subrogation
                        </span>
                      )}
                      {p.description && (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          {p.description}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Step 2: Holder */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={2} />
          <div>
            <h4 className="text-sm font-semibold text-slate-800">Certificate Holder</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              The company or person this certificate is issued to.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <FormField
            id="holder-name"
            label="Holder name"
            required
            value={holderName}
            onChange={setHolderName}
            placeholder="Sheffer Construction & Development LLC"
          />
          <FormField
            id="holder-addr1"
            label="Address line 1"
            required
            value={holderAddress1}
            onChange={setHolderAddress1}
            placeholder="1425 N. Royal Ave."
          />
          <FormField
            id="holder-addr2"
            label="Address line 2"
            value={holderAddress2}
            onChange={setHolderAddress2}
            placeholder="Evansville, IN 47711"
          />
        </div>
      </div>

      {state.kind === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <div className="pt-1">
        <button
          type="submit"
          disabled={state.kind === 'submitting'}
          className="w-full rounded-xl bg-kyblue-500 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-kyblue-600 focus:outline-none focus:ring-2 focus:ring-kyblue-500 focus:ring-offset-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state.kind === 'submitting' ? (
            <span className="flex items-center justify-center gap-2">
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Submitting…
            </span>
          ) : (
            'Request Certificate'
          )}
        </button>
        <p className="mt-3 text-center text-xs text-slate-400">
          Requests are reviewed by Brook before the certificate is sent.
        </p>
      </div>
    </form>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kyblue-500 text-xs font-bold text-white">
      {n}
    </span>
  );
}

function FormField({
  id,
  label,
  required,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-2 focus:ring-kyblue-200 transition-colors"
      />
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
