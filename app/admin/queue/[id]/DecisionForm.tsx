'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Hairline } from '@/app/components/Hairline';

type Decision = 'approve' | 'edit' | 'reject';

type HolderEdit = { name: string; address1: string; address2: string };

const MODE_CONFIG = {
  approve: {
    label: 'Approve',
    sub: 'Send as-is',
    submit: 'bg-success hover:bg-success/90',
    submitLabel: 'Approve & send',
    activeColor: 'text-success',
    activeBg: 'bg-success-soft',
    activeRing: 'ring-success/30',
  },
  edit: {
    label: 'Edit',
    sub: 'Adjust before send',
    submit: 'bg-warning hover:bg-warning/90',
    submitLabel: 'Save edits & send',
    activeColor: 'text-warning',
    activeBg: 'bg-warning-soft',
    activeRing: 'ring-warning/30',
  },
  reject: {
    label: 'Reject',
    sub: 'Send back to client',
    submit: 'bg-danger hover:bg-danger/90',
    submitLabel: 'Reject request',
    activeColor: 'text-danger',
    activeBg: 'bg-danger-soft',
    activeRing: 'ring-danger/30',
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
    <form onSubmit={handleSubmit}>
      <Hairline label="Decision" className="mb-6" />

      {/* Segmented control */}
      <div
        role="radiogroup"
        aria-label="Decision"
        className="grid grid-cols-3 gap-0 overflow-hidden rounded-md border border-hairline-strong bg-card"
      >
        {(['approve', 'edit', 'reject'] as Decision[]).map((d, i) => {
          const c = MODE_CONFIG[d];
          const isActive = mode === d;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setMode(d)}
              className={`focus-ring relative px-4 py-3.5 text-left transition-colors ${
                i > 0 ? 'border-l border-hairline-strong' : ''
              } ${isActive ? `${c.activeBg} ring-2 ring-inset ${c.activeRing}` : 'hover:bg-paper-deep/40'}`}
            >
              <span
                className={`block text-sm font-semibold ${
                  isActive ? c.activeColor : 'text-ink'
                }`}
              >
                {c.label}
              </span>
              <span className="mt-0.5 block text-[0.7rem] text-ink-muted">{c.sub}</span>
            </button>
          );
        })}
      </div>

      {/* Mode-specific content */}
      <AnimatePresence mode="wait">
        {mode === 'edit' && (
          <motion.div
            key="edit"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-8"
          >
            <p className="caps text-[0.6rem] font-medium text-ink-faint">
              Holder fields will be re-rendered before send
            </p>
            <div className="mt-4 space-y-5">
              <UnderlinedField
                id="holder-name"
                label="Holder name"
                value={holder.name}
                onChange={(name) => setHolder((h) => ({ ...h, name }))}
              />
              <UnderlinedField
                id="holder-addr1"
                label="Address line 1"
                value={holder.address1}
                onChange={(address1) => setHolder((h) => ({ ...h, address1 }))}
              />
              <UnderlinedField
                id="holder-addr2"
                label="Address line 2"
                value={holder.address2}
                onChange={(address2) => setHolder((h) => ({ ...h, address2 }))}
              />
            </div>
          </motion.div>
        )}

        {mode === 'reject' && (
          <motion.div
            key="reject"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="mt-8"
          >
            <label
              htmlFor="reject-reason"
              className="caps block text-[0.62rem] font-semibold text-ink-muted"
            >
              Reason — sent to client
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="The holder address looks incomplete — please double-check and resubmit."
              className="field-underline mt-2 block w-full resize-none text-base text-ink"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Remember this correction */}
      {mode !== 'reject' && (
        <div className="mt-10 border border-dashed border-hairline-strong p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={rememberThis}
              onChange={(e) => setRememberThis(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded-[3px] border-hairline-strong text-brand focus:ring-brand/40"
            />
            <span>
              <span className="caps block text-[0.62rem] font-semibold text-ink">
                Remember this for next time
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                Save this correction so the AI reviewer applies it on future certs for this client.
              </span>
            </span>
          </label>

          <AnimatePresence>
            {rememberThis && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-5 space-y-5 pl-7">
                  <div>
                    <label
                      htmlFor="override-scope"
                      className="caps block text-[0.62rem] font-semibold text-ink-muted"
                    >
                      Scope
                    </label>
                    <select
                      id="override-scope"
                      value={overrideScope}
                      onChange={(e) => setOverrideScope(e.target.value as typeof overrideScope)}
                      className="field-underline mt-2 block w-full appearance-none bg-transparent pr-8 text-base text-ink"
                    >
                      <option value="holder">Holder</option>
                      <option value="coverage">Coverage</option>
                      <option value="general">General</option>
                    </select>
                  </div>
                  <UnderlinedField
                    id="override-pattern"
                    label="When this happens"
                    value={overridePattern}
                    onChange={setOverridePattern}
                    placeholder="e.g. holder is Sheffer Construction"
                  />
                  <UnderlinedField
                    id="override-correction"
                    label="Do this"
                    value={overrideCorrection}
                    onChange={setOverrideCorrection}
                    placeholder="e.g. add Suite 200 to address line 2"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {error && (
        <p className="mt-6 border-l-2 border-danger pl-4 text-sm leading-relaxed text-danger">
          {error}
        </p>
      )}

      <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="submit"
          disabled={submitting}
          className={`focus-ring inline-flex items-center justify-center rounded-md px-7 py-3.5 text-sm font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60 ${cfg.submit}`}
        >
          {submitting ? 'Working…' : cfg.submitLabel}
        </button>
      </div>
    </form>
  );
}

function UnderlinedField({
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
      <label
        htmlFor={id}
        className="caps block text-[0.62rem] font-semibold text-ink-muted"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-underline mt-2 block w-full text-base text-ink"
      />
    </div>
  );
}
