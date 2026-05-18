'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Decision = 'approve' | 'edit' | 'reject';

type HolderEdit = { name: string; address1: string; address2: string };

const MODE_CONFIG = {
  approve: {
    label: 'Approve & send',
    active: 'bg-green-600 border-green-600 text-white',
    inactive: 'bg-white border-slate-300 text-slate-700 hover:border-green-400 hover:text-green-700',
    submit: 'bg-green-600 hover:bg-green-700 focus:ring-green-500 text-white',
    submitLabel: 'Approve & send',
  },
  edit: {
    label: 'Edit then send',
    active: 'bg-amber-500 border-amber-500 text-white',
    inactive: 'bg-white border-slate-300 text-slate-700 hover:border-amber-400 hover:text-amber-700',
    submit: 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-500 text-white',
    submitLabel: 'Save edits & send',
  },
  reject: {
    label: 'Reject',
    active: 'bg-red-600 border-red-600 text-white',
    inactive: 'bg-white border-slate-300 text-slate-700 hover:border-red-400 hover:text-red-700',
    submit: 'bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white',
    submitLabel: 'Reject request',
  },
} as const;

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
      const body: Record<string, unknown> = { requestId, decision: mode };
      if (mode === 'edit') body.holder = holder;
      if (mode === 'reject') body.decisionNote = rejectReason;
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

  const cfg = MODE_CONFIG[mode];

  return (
    <form onSubmit={handleSubmit} className="mt-5 rounded-xl border border-slate-200 bg-white shadow-sm p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
        Decision
      </p>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {(['approve', 'edit', 'reject'] as Decision[]).map((d) => {
          const c = MODE_CONFIG[d];
          const isActive = mode === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setMode(d)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${
                isActive ? c.active : c.inactive
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Edit mode: holder fields */}
      {mode === 'edit' && (
        <div className="mt-5 space-y-3">
          <p className="text-xs text-slate-500">
            Adjust the holder fields below. The cert will be re-rendered with your changes before
            sending.
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

      {/* Reject mode: reason */}
      {mode === 'reject' && (
        <div className="mt-5">
          <label htmlFor="reject-reason" className="block text-xs font-medium text-slate-700 mb-1.5">
            Reason (sent to client)
          </label>
          <textarea
            id="reject-reason"
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="The holder address looks incomplete — please double-check and resubmit."
            className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-2 focus:ring-kyblue-200 transition-colors"
          />
        </div>
      )}

      {/* Remember this correction */}
      {mode !== 'reject' && (
        <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberThis}
              onChange={(e) => setRememberThis(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-kyblue-500 focus:ring-kyblue-400"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">
                Remember this for next time
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Save this correction so the AI reviewer applies it on future certs for this client.
              </span>
            </span>
          </label>

          {rememberThis && (
            <div className="mt-4 space-y-3 pl-7">
              <div>
                <label htmlFor="override-scope" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Scope
                </label>
                <select
                  id="override-scope"
                  value={overrideScope}
                  onChange={(e) => setOverrideScope(e.target.value as typeof overrideScope)}
                  className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-2 focus:ring-kyblue-200 transition-colors"
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
                placeholder="e.g. add Suite 200 to address line 2"
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-xl px-6 py-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${cfg.submit}`}
        >
          {submitting ? 'Working…' : cfg.submitLabel}
        </button>
      </div>
    </form>
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
      <label htmlFor={id} className="block text-xs font-medium text-slate-700 mb-1.5">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-2 focus:ring-kyblue-200 transition-colors"
      />
    </div>
  );
}
