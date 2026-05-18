'use client';

import { useState, type FormEvent } from 'react';

export type PolicyForForm = {
  id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policyNumber: string;
  effDate: string; // 'YYYY-MM-DD'
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

function formatDate(iso: string): string {
  // 'YYYY-MM-DD' → 'MM/DD/YYYY'
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
      setState({
        kind: 'success',
        certNumber: json.certNumber ?? 'pending',
      });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Network error.',
      });
    }
  }

  if (state.kind === 'success') {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-6">
        <h3 className="font-semibold text-green-900">Request submitted</h3>
        <p className="mt-2 text-sm text-green-800">
          Your request <span className="font-mono">{state.certNumber}</span> has been queued for
          Brook&apos;s review. You&apos;ll receive an email with the certificate attached once it
          clears review (usually within a few business hours).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <h3 className="text-base font-semibold text-gray-900">1. Select coverages</h3>
        <p className="mt-1 text-xs text-gray-500">
          All eligible, in-force policies are checked by default. Uncheck any you don&apos;t want
          on this certificate.
        </p>
        <ul className="mt-4 divide-y divide-gray-200 rounded-md border border-gray-200 bg-white">
          {policies.map((p) => (
            <li key={p.id} className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                id={`policy-${p.id}`}
                checked={selected.has(p.id)}
                onChange={() => togglePolicy(p.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor={`policy-${p.id}`} className="flex-1 cursor-pointer">
                <div className="font-medium text-gray-900">{TYPE_LABEL[p.type]}</div>
                <div className="mt-1 text-sm text-gray-600">
                  {p.insurerName} · policy {p.policyNumber}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Effective {formatDate(p.effDate)} — expires {formatDate(p.expDate)}
                </div>
                {(p.addlInsuredBlanket || p.subrogationWaived || p.description) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {p.addlInsuredBlanket && (
                      <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                        Additional Insured: blanket
                      </span>
                    )}
                    {p.subrogationWaived && (
                      <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                        Waiver of Subrogation
                      </span>
                    )}
                    {p.description && (
                      <span className="inline-flex rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                        {p.description}
                      </span>
                    )}
                  </div>
                )}
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="text-base font-semibold text-gray-900">2. Certificate Holder</h3>
        <p className="mt-1 text-xs text-gray-500">
          The company or person this certificate is being issued to.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="holder-name" className="block text-sm font-medium text-gray-700">
              Holder name <span className="text-red-500">*</span>
            </label>
            <input
              id="holder-name"
              type="text"
              required
              value={holderName}
              onChange={(e) => setHolderName(e.target.value)}
              placeholder="Sheffer Construction & Development LLC"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="holder-addr1" className="block text-sm font-medium text-gray-700">
              Address line 1 <span className="text-red-500">*</span>
            </label>
            <input
              id="holder-addr1"
              type="text"
              required
              value={holderAddress1}
              onChange={(e) => setHolderAddress1(e.target.value)}
              placeholder="1425 N. Royal Ave."
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="holder-addr2" className="block text-sm font-medium text-gray-700">
              Address line 2
            </label>
            <input
              id="holder-addr2"
              type="text"
              value={holderAddress2}
              onChange={(e) => setHolderAddress2(e.target.value)}
              placeholder="Evansville, IN 47711"
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </section>

      {state.kind === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {state.message}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-6">
        <button
          type="submit"
          disabled={state.kind === 'submitting'}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === 'submitting' ? 'Submitting…' : 'Request Certificate'}
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Requests are reviewed by Brook before the certificate is sent. You&apos;ll receive an
        email with the certificate attached once it&apos;s approved.
      </p>
    </form>
  );
}
