'use client';

import { useState, useRef, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';

type ClientOption = { id: string; business_name: string };

type Extracted = {
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT';
  policyNumber: string;
  effDate: string;
  expDate: string;
  insurerName: string;
  insurerNaic: string | null;
  limits: Record<string, number>;
  addlInsuredBlanket: boolean;
  subrogationWaived: boolean;
  description: string | null;
};

type Step = 'upload' | 'review' | 'done';

export function PolicyImportForm({ clients }: { clients: ClientOption[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [savedPolicyId, setSavedPolicyId] = useState<string | null>(null);

  async function handleExtract() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Choose a file first.'); return; }
    if (!clientId) { setError('Select a client first.'); return; }

    setError(null);
    setExtracting(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch('/api/admin/extract-policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileBase64: base64, mediaType: file.type }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? `Extraction failed (${res.status})`);
      }
      const body = await res.json() as { extracted: Extracted };
      setExtracted(body.extracted);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!extracted) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/save-policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, ...extracted }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string; error?: string };
        throw new Error(body.detail ?? body.error ?? `Save failed (${res.status})`);
      }
      const body = await res.json() as { policyId: string };
      setSavedPolicyId(body.policyId);
      setStep('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  function updateLimit(key: string, val: string) {
    if (!extracted) return;
    const num = parseFloat(val.replace(/,/g, ''));
    setExtracted({ ...extracted, limits: { ...extracted.limits, [key]: isNaN(num) ? 0 : num } });
  }

  if (step === 'done') {
    return (
      <div className="border border-success/30 bg-success-soft/30 px-6 py-8">
        <p className="caps text-[0.65rem] font-semibold text-success">Policy saved</p>
        <p className="mt-3 font-display text-2xl font-medium text-ink">
          {extracted?.type} policy added to{' '}
          {clients.find((c) => c.id === clientId)?.business_name}.
        </p>
        <p className="mt-2 font-mono text-sm text-ink-muted">Policy ID: {savedPolicyId}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => { setStep('upload'); setExtracted(null); setSavedPolicyId(null); if (fileRef.current) fileRef.current.value = ''; }}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            Import another
          </button>
          <a
            href="/admin/queue"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-5 py-2.5 text-sm font-semibold text-ink hover:bg-paper-deep/40"
          >
            Back to queue
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Step 1: Select client + upload */}
      <section>
        <div className="space-y-6">
          <div>
            <label htmlFor="client-select" className="caps block text-[0.62rem] font-semibold text-ink-muted">
              Client this policy belongs to
            </label>
            <select
              id="client-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="field-underline mt-2 block w-full appearance-none bg-transparent text-base text-ink"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.business_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="caps block text-[0.62rem] font-semibold text-ink-muted">
              Declarations page (PDF or image)
            </label>
            <div className="mt-2">
              <label className="flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-hairline-strong px-6 py-10 transition-colors hover:border-ink-muted hover:bg-paper-deep/30">
                <UploadIcon className="h-8 w-8 text-ink-faint" />
                <span className="text-sm text-ink-muted">
                  Drop a PDF, PNG, or JPEG here, or click to browse
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const name = e.target.files?.[0]?.name;
                    if (name) setError(null);
                  }}
                />
              </label>
            </div>
          </div>

          {error && step === 'upload' && (
            <p className="border-l-2 border-danger pl-4 text-sm text-danger">{error}</p>
          )}

          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {extracting ? 'Extracting with Claude…' : 'Extract policy data'}
          </button>
        </div>
      </section>

      {/* Step 2: Review extracted data */}
      {step === 'review' && extracted && (
        <section className="border-t border-hairline pt-10">
          <p className="caps mb-6 text-[0.65rem] font-semibold text-seal-deep">
            Review extracted data · edit any field before saving
          </p>

          <div className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Policy type" value={extracted.type} onEdit={(v) => setExtracted({ ...extracted, type: v as Extracted['type'] })} />
              <Field label="Policy number" value={extracted.policyNumber} onEdit={(v) => setExtracted({ ...extracted, policyNumber: v })} />
              <Field label="Effective date (YYYY-MM-DD)" value={extracted.effDate} onEdit={(v) => setExtracted({ ...extracted, effDate: v })} />
              <Field label="Expiration date (YYYY-MM-DD)" value={extracted.expDate} onEdit={(v) => setExtracted({ ...extracted, expDate: v })} />
              <Field label="Carrier name" value={extracted.insurerName} onEdit={(v) => setExtracted({ ...extracted, insurerName: v })} />
              <Field label="NAIC code" value={extracted.insurerNaic ?? ''} onEdit={(v) => setExtracted({ ...extracted, insurerNaic: v || null })} />
            </div>

            {Object.keys(extracted.limits).length > 0 && (
              <div>
                <p className="caps mb-3 text-[0.6rem] font-medium text-ink-faint">Coverage limits</p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(extracted.limits).map(([key, val]) => (
                    <div key={key}>
                      <label className="caps block text-[0.58rem] font-medium text-ink-faint">
                        {camelToLabel(key)}
                      </label>
                      <input
                        type="text"
                        value={val.toLocaleString()}
                        onChange={(e) => updateLimit(key, e.target.value)}
                        className="field-underline mt-1 block w-full text-sm text-ink"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={extracted.addlInsuredBlanket}
                  onChange={(e) => setExtracted({ ...extracted, addlInsuredBlanket: e.target.checked })}
                  className="h-4 w-4 rounded-[3px] border-hairline-strong text-brand"
                />
                Additional Insured · blanket
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={extracted.subrogationWaived}
                  onChange={(e) => setExtracted({ ...extracted, subrogationWaived: e.target.checked })}
                  className="h-4 w-4 rounded-[3px] border-hairline-strong text-brand"
                />
                Waiver of Subrogation
              </label>
            </div>

            <Field
              label="Description / notes"
              value={extracted.description ?? ''}
              onEdit={(v) => setExtracted({ ...extracted, description: v || null })}
            />
          </div>

          {error && step === 'review' && (
            <p className="mt-6 border-l-2 border-danger pl-4 text-sm text-danger">{error}</p>
          )}

          <div className="mt-8 flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-success px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save policy to database'}
            </button>
            <button
              type="button"
              onClick={() => setStep('upload')}
              className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-5 py-3.5 text-sm font-semibold text-ink hover:bg-paper-deep/40"
            >
              Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: (v: string) => void;
}) {
  return (
    <div>
      <label className="caps block text-[0.62rem] font-semibold text-ink-muted">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onEdit(e.target.value)}
        className="field-underline mt-2 block w-full text-base text-ink"
      />
    </div>
  );
}

function camelToLabel(s: string): string {
  return s.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
    </svg>
  );
}
