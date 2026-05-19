'use client';

import { useState, type FormEvent } from 'react';

export type OverrideScope = 'holder' | 'coverage' | 'general';

export type OverrideRow = {
  id: string;
  scope: OverrideScope;
  pattern: string;
  correction: string;
  added_by: string;
  added_at: string;
};

const SCOPE_LABEL: Record<OverrideScope, string> = {
  holder: 'Holder',
  coverage: 'Coverage',
  general: 'General',
};

export function OverridesEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: OverrideRow[];
}) {
  const [rows, setRows] = useState<OverrideRow[]>(initial);
  const [scope, setScope] = useState<OverrideScope>('holder');
  const [pattern, setPattern] = useState('');
  const [correction, setCorrection] = useState('');
  const [busy, setBusy] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!pattern.trim() || !correction.trim()) {
      setError('Both pattern and correction are required.');
      return;
    }
    setBusy('submitting');
    try {
      const res = await fetch('/api/admin/client-overrides', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          scope,
          pattern: pattern.trim(),
          correction: correction.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Request failed (${res.status}).`);
        setBusy('idle');
        return;
      }
      const { override } = (await res.json()) as { override: OverrideRow };
      setRows((prev) => [override, ...prev]);
      setPattern('');
      setCorrection('');
      setScope('holder');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setBusy('idle');
    }
  }

  async function handleRemove(id: string) {
    setRemovingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/client-overrides?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || `Remove failed (${res.status}).`);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="space-y-12">
      <section>
        <h2 className="caps text-[0.62rem] font-semibold text-seal-deep">Active overrides</h2>
        {rows.length === 0 ? (
          <p className="mt-4 border border-hairline bg-card px-5 py-6 text-sm text-ink-muted">
            No overrides yet. Add one below to teach the reviewer a rule for this client.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-3 px-1 py-4 sm:grid-cols-[auto_1fr_auto] sm:gap-5">
                <span className="caps inline-flex h-fit items-center rounded-full border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.55rem] font-semibold text-seal-deep">
                  {SCOPE_LABEL[r.scope]}
                </span>
                <div className="min-w-0">
                  <p className="text-sm leading-relaxed text-ink">
                    <span className="font-semibold text-ink">When:</span> {r.pattern}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    <span className="font-semibold text-ink">Do:</span> {r.correction}
                  </p>
                  <p className="caps mt-2 text-[0.55rem] font-medium text-ink-faint">
                    Added by {r.added_by} · {formatTimestamp(r.added_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(r.id)}
                  disabled={removingId === r.id}
                  className="focus-ring caps inline-flex h-fit items-center rounded border border-hairline-strong bg-white px-2.5 py-1 text-[0.6rem] font-semibold text-ink-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-50"
                >
                  {removingId === r.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="caps text-[0.62rem] font-semibold text-seal-deep">Add an override</h2>
        <form onSubmit={handleAdd} className="mt-4 space-y-5">
          <div>
            <label htmlFor="ov-scope" className="caps block text-[0.6rem] font-semibold text-ink-faint">
              Scope
            </label>
            <select
              id="ov-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as OverrideScope)}
              className="field-underline mt-2 block w-full appearance-none bg-transparent text-base text-ink"
            >
              <option value="holder">Holder — naming, addresses, aliases</option>
              <option value="coverage">Coverage — limits, endorsements, AI/WoS</option>
              <option value="general">General — anything else specific to this client</option>
            </select>
          </div>

          <div>
            <label htmlFor="ov-pattern" className="caps block text-[0.6rem] font-semibold text-ink-faint">
              When (pattern)
            </label>
            <textarea
              id="ov-pattern"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              rows={2}
              placeholder='e.g. "Holder name comes in as ‘Sheffer Const’"'
              className="field-underline mt-2 block w-full resize-none text-base text-ink"
            />
          </div>

          <div>
            <label htmlFor="ov-correction" className="caps block text-[0.6rem] font-semibold text-ink-faint">
              Do (correction)
            </label>
            <textarea
              id="ov-correction"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={3}
              placeholder='e.g. "Use the full legal name: Sheffer Construction LLC"'
              className="field-underline mt-2 block w-full resize-none text-base text-ink"
            />
          </div>

          {error && (
            <p className="border border-danger/30 bg-danger-soft/40 px-4 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy === 'submitting'}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
          >
            {busy === 'submitting' ? 'Adding…' : 'Add override'}
          </button>
        </form>
      </section>
    </div>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
