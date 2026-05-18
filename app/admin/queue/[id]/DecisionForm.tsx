'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approve' | 'edit' | 'reject';

type HolderEdit = {
  name: string;
  address1: string;
  address2: string;
};

export function DecisionForm({
  requestId,
  clientId,
  currentHolder,
}: {
  requestId: string;
  clientId: string;
  currentHolder: HolderEdit;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Decision>('approve');
  const [holder, setHolder] = useState<HolderEdit>(currentHolder);
  const [rejectReason, setRejectReason] = useState('');
  const [rememberThis, setRememberThis] = useState(false);
  const [overrideScope, setOverrideScope] = useState<'holder' | 'coverage' | 'general'>('holder');
  const [overridePattern, setOverridePattern] = useState('');
  const [overrideCorrection, setOverrideCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        requestId,
        decision: mode,
      };
      if (mode === 'edit') {
        body.holder = holder;
      }
      if (mode === 'reject') {
        body.decisionNote = rejectReason;
      }
      if (rememberThis && mode !== 'reject') {
        body.override = {
          clientId,
          scope: overrideScope,
          pattern: overridePattern.trim(),
          correction: overrideCorrection.trim(),
        };
      }
      const res = await fetch('/api/decide-cert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Request failed (${res.status}).`);
        return;
      }
      router.push('/admin/queue');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 rounded-md border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Decision</h2>

      <fieldset className="mt-4">
        <legend className="sr-only">Choose a decision</legend>
        <div className="flex flex-wrap gap-2">
          <DecisionPill value="approve" current={mode} onSelect={setMode}>
            Approve & send
          </DecisionPill>
          <DecisionPill value="edit" current={mode} onSelect={setMode}>
            Edit then send
          </DecisionPill>
          <DecisionPill value="reject" current={mode} onSelect={setMode}>
            Reject
          </DecisionPill>
        </div>
      </fieldset>

      {mode === 'edit' && (
        <div className="mt-6 space-y-3">
          <p className="text-xs text-gray-500">
            Adjust the holder fields. The cert will be re-rendered before sending.
          </p>
          <LabeledInput
            id="holder-name"
            label="Holder name"
            value={holder.name}
            onChange={(name) => setHolder((h) => ({ ...h, name }))}
          />
          <LabeledInput
            id="holder-addr1"
            label="Address line 1"
            value={holder.address1}
            onChange={(address1) => setHolder((h) => ({ ...h, address1 }))}
          />
          <LabeledInput
            id="holder-addr2"
            label="Address line 2"
            value={holder.address2}
            onChange={(address2) => setHolder((h) => ({ ...h, address2 }))}
          />
        </div>
      )}

      {mode === 'reject' && (
        <div className="mt-6">
          <label htmlFor="reject-reason" className="block text-sm font-medium text-gray-700">
            Reason for the client
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="The holder address looks incomplete — please double-check and resubmit."
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      )}

      {mode !== 'reject' && (
        <div className="mt-6 rounded-md border border-dashed border-gray-300 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={rememberThis}
              onChange={(e) => setRememberThis(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-800">
              <span className="font-medium">Remember this for next time</span>
              <span className="block text-xs text-gray-500">
                Save this correction so the reviewer agent applies it on future certs for this
                client.
              </span>
            </span>
          </label>

          {rememberThis && (
            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="override-scope" className="block text-sm font-medium text-gray-700">
                  Scope
                </label>
                <select
                  id="override-scope"
                  value={overrideScope}
                  onChange={(e) => setOverrideScope(e.target.value as typeof overrideScope)}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="holder">Holder</option>
                  <option value="coverage">Coverage</option>
                  <option value="general">General</option>
                </select>
              </div>
              <LabeledInput
                id="override-pattern"
                label="When this happens"
                value={overridePattern}
                onChange={setOverridePattern}
                placeholder="e.g. holder is Sheffer Construction"
              />
              <LabeledInput
                id="override-correction"
                label="Do this"
                value={overrideCorrection}
                onChange={setOverrideCorrection}
                placeholder="e.g. add 'Suite 200' to address line 2"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Working…' : confirmLabel(mode)}
        </button>
      </div>
    </form>
  );
}

function confirmLabel(mode: Decision): string {
  if (mode === 'approve') return 'Approve & send';
  if (mode === 'edit') return 'Save edits & send';
  return 'Reject request';
}

function DecisionPill({
  value,
  current,
  onSelect,
  children,
}: {
  value: Decision;
  current: Decision;
  onSelect: (v: Decision) => void;
  children: React.ReactNode;
}) {
  const isActive = value === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    </div>
  );
}
