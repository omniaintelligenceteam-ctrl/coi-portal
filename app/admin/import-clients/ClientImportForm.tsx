/**
 * Bulk client-import form (client component).
 *
 * Flow:
 *   1. User picks the agency (defaults to single agency if only one exists)
 *   2. User uploads a CSV or pastes CSV text. papaparse parses in-browser.
 *   3. We POST {rows, agencyId, dryRun: true} to /api/admin/import-clients,
 *      receive per-row outcomes, render a preview table.
 *   4. If there are 0 errors and at least 1 row, the Commit button enables.
 *   5. Commit POSTs again with dryRun: false; we show the final summary.
 *
 * Validation is server-side (the API is authoritative); client-side is just
 * the CSV parse + UX preview. This keeps the schema in one place.
 */

'use client';

import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { toast } from 'sonner';

type Agency = { id: string; name: string };
type FormInfo = { id: string; displayName: string; revision: string };

type RowOutcome = {
  rowIndex: number;
  business_name: string;
  contact_email: string;
  status: 'ok' | 'updated' | 'error';
  action?: 'insert' | 'update' | 'skip';
  message?: string;
  warnings?: string[];
};

type ApiResponse = {
  ok: boolean;
  dryRun: boolean;
  agencyId: string;
  summary: { inserted: number; updated: number; errored: number; totalRows: number };
  outcomes: RowOutcome[];
};

type ParsedRow = {
  business_name?: string;
  contact_email?: string;
  contact_name?: string;
  phone?: string;
  business_address1?: string;
  business_address2?: string;
  city?: string;
  state?: string;
  zip?: string;
  enabled_forms?: string[];
  notes?: string;
};

function parseCsv(text: string): { rows: ParsedRow[]; parseErrors: string[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const parseErrors = result.errors.map((e) => `row ${e.row}: ${e.message}`);
  const rows: ParsedRow[] = result.data.map((r) => ({
    business_name: r.business_name?.trim() ?? '',
    contact_email: r.contact_email?.trim() ?? '',
    contact_name: r.contact_name?.trim() || undefined,
    phone: r.phone?.trim() || undefined,
    business_address1: r.business_address1?.trim() || undefined,
    business_address2: r.business_address2?.trim() || undefined,
    city: r.city?.trim() || undefined,
    state: r.state?.trim() || undefined,
    zip: r.zip?.trim() || undefined,
    // CSV stores enabled_forms as pipe-separated string. Empty → server default.
    enabled_forms: r.enabled_forms
      ? r.enabled_forms
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    notes: r.notes?.trim() || undefined,
  }));
  return { rows, parseErrors };
}

export default function ClientImportForm({
  agencies,
  knownForms,
}: {
  agencies: Agency[];
  knownForms: FormInfo[];
}) {
  const [agencyId, setAgencyId] = useState<string>(agencies[0]?.id ?? '');
  const [csvText, setCsvText] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<ApiResponse | null>(null);
  const [committed, setCommitted] = useState<ApiResponse | null>(null);
  const [busy, setBusy] = useState<'idle' | 'preview' | 'commit'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const errorRows = useMemo(() => preview?.outcomes.filter((o) => o.status === 'error') ?? [], [preview]);
  const canCommit = preview && !committed && errorRows.length === 0 && rows.length > 0;

  async function onFile(file: File) {
    const text = await file.text();
    setCsvText(text);
    const { rows, parseErrors } = parseCsv(text);
    setRows(rows);
    setParseErrors(parseErrors);
    setPreview(null);
    setCommitted(null);
  }

  function onPasteText(text: string) {
    setCsvText(text);
    if (text.trim() === '') {
      setRows([]);
      setParseErrors([]);
      setPreview(null);
      setCommitted(null);
      return;
    }
    const { rows, parseErrors } = parseCsv(text);
    setRows(rows);
    setParseErrors(parseErrors);
    setPreview(null);
    setCommitted(null);
  }

  async function runDryRun() {
    if (!agencyId || rows.length === 0) return;
    setBusy('preview');
    try {
      const res = await fetch('/api/admin/import-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, dryRun: true, rows }),
      });
      const body = (await res.json()) as ApiResponse | { error: string; detail?: string };
      if (!res.ok) {
        toast.error(`Preview failed: ${'error' in body ? body.error : 'unknown'}`);
        setBusy('idle');
        return;
      }
      setPreview(body as ApiResponse);
      const { summary } = body as ApiResponse;
      if (summary.errored > 0) {
        toast.warning(`${summary.errored} row(s) need fixing before commit.`);
      } else {
        toast.success(`${summary.inserted} new, ${summary.updated} updates ready to commit.`);
      }
    } catch (err) {
      toast.error(`Preview crashed: ${(err as Error).message}`);
    } finally {
      setBusy('idle');
    }
  }

  async function runCommit() {
    if (!canCommit) return;
    setBusy('commit');
    try {
      const res = await fetch('/api/admin/import-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, dryRun: false, rows }),
      });
      const body = (await res.json()) as ApiResponse | { error: string; detail?: string };
      if (!res.ok) {
        toast.error(`Commit failed: ${'error' in body ? body.error : 'unknown'}`);
        setBusy('idle');
        return;
      }
      setCommitted(body as ApiResponse);
      const { summary } = body as ApiResponse;
      toast.success(`Imported: ${summary.inserted} new, ${summary.updated} updated.`);
    } catch (err) {
      toast.error(`Commit crashed: ${(err as Error).message}`);
    } finally {
      setBusy('idle');
    }
  }

  const displayOutcomes = committed?.outcomes ?? preview?.outcomes ?? [];
  const summary = committed?.summary ?? preview?.summary;

  return (
    <div className="space-y-6">
      {/* Step 1 — agency */}
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Step 1 — Agency</h2>
        {agencies.length === 0 ? (
          <p className="mt-2 text-sm text-red-700">No agencies exist yet. Create an agency first.</p>
        ) : agencies.length === 1 ? (
          <p className="mt-2 text-base">
            Importing into <strong>{agencies[0]?.name}</strong>.
          </p>
        ) : (
          <select
            className="mt-2 w-full max-w-md rounded border border-stone-300 px-3 py-2 text-base"
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
          >
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </section>

      {/* Step 2 — CSV input */}
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Step 2 — Paste or upload roster CSV
        </h2>
        <p className="mt-1 text-sm text-stone-600">
          Required columns: <code>business_name, contact_email</code>. Optional:{' '}
          <code>contact_name, phone, business_address1, business_address2, city, state, zip, enabled_forms, notes</code>.
          <br />
          <code>enabled_forms</code> is pipe-separated form ids (e.g. <code>ACORD_25|ACORD_27</code>). Empty defaults to{' '}
          <code>ACORD_25</code>.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <span className="text-xs text-stone-500">…or paste below</span>
        </div>
        <textarea
          className="mt-3 h-40 w-full rounded border border-stone-300 px-3 py-2 font-mono text-xs"
          placeholder="business_name,contact_email,..."
          value={csvText}
          onChange={(e) => onPasteText(e.target.value)}
        />
        {parseErrors.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
            {parseErrors.slice(0, 10).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {parseErrors.length > 10 && <li>…and {parseErrors.length - 10} more parse warnings</li>}
          </ul>
        )}
        {rows.length > 0 && (
          <p className="mt-2 text-sm text-stone-600">
            Parsed <strong>{rows.length}</strong> row(s).
          </p>
        )}
        <details className="mt-3 text-xs text-stone-500">
          <summary className="cursor-pointer">Known form codes ({knownForms.length})</summary>
          <ul className="mt-2 list-disc pl-5">
            {knownForms.map((f) => (
              <li key={f.id}>
                <code>{f.id}</code> — {f.displayName} ({f.revision})
              </li>
            ))}
          </ul>
        </details>
      </section>

      {/* Step 3 — preview */}
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Step 3 — Preview (dry-run)</h2>
          <button
            type="button"
            disabled={!agencyId || rows.length === 0 || busy !== 'idle' || Boolean(committed)}
            onClick={runDryRun}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === 'preview' ? 'Previewing…' : 'Preview rows'}
          </button>
        </div>
        {summary && (
          <p className="mt-3 text-sm text-stone-700">
            <strong>{summary.totalRows}</strong> total · <strong>{summary.inserted}</strong> new ·{' '}
            <strong>{summary.updated}</strong> will update ·{' '}
            <span className={summary.errored > 0 ? 'text-red-700' : 'text-stone-700'}>
              <strong>{summary.errored}</strong> error{summary.errored === 1 ? '' : 's'}
            </span>
            {committed && <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">COMMITTED</span>}
          </p>
        )}
        {displayOutcomes.length > 0 && (
          <div className="mt-3 max-h-96 overflow-auto rounded border border-stone-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-stone-100 text-stone-700">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {displayOutcomes.map((o) => (
                  <tr key={o.rowIndex} className="border-t border-stone-200">
                    <td className="px-3 py-2 text-stone-500">{o.rowIndex + 1}</td>
                    <td className="px-3 py-2">
                      {o.status === 'error' && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">ERROR</span>}
                      {o.status === 'updated' && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">UPDATE</span>
                      )}
                      {o.status === 'ok' && o.action === 'insert' && (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">NEW</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{o.business_name}</td>
                    <td className="px-3 py-2 font-mono">{o.contact_email}</td>
                    <td className="px-3 py-2 text-stone-600">
                      {o.message ?? o.warnings?.join(' ') ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Step 4 — commit */}
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Step 4 — Commit</h2>
          <button
            type="button"
            disabled={!canCommit || busy !== 'idle'}
            onClick={runCommit}
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy === 'commit' ? 'Committing…' : 'Commit import'}
          </button>
        </div>
        <p className="mt-2 text-xs text-stone-500">
          {committed
            ? 'Import complete. Every created/updated client has an audit-log entry.'
            : canCommit
            ? 'Preview is clean. Click Commit to insert / update.'
            : preview && errorRows.length > 0
            ? 'Fix error rows in the CSV and re-run Preview.'
            : 'Run Preview first.'}
        </p>
      </section>
    </div>
  );
}
