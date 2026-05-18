'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';

export type QueueRow = {
  id: string;
  cert_number: string;
  holder_name: string;
  status: CertStatus;
  requested_at: string;
  reviewer_pass: boolean | null;
  reviewer_flags: { severity: 'error' | 'warning' | 'info' }[];
  client: { business_name: string } | null;
};

function flagCounts(flags: QueueRow['reviewer_flags']) {
  let errors = 0;
  let warnings = 0;
  for (const f of flags ?? []) {
    if (f.severity === 'error') errors++;
    else if (f.severity === 'warning') warnings++;
  }
  return { errors, warnings };
}

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type BulkState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; succeeded: number; failed: { id: string; certNumber: string | null; error: string }[] };

export function QueueTable({ rows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<BulkState>({ kind: 'idle' });

  const eligibleIds = new Set(
    rows.filter((r) => r.status === 'pending' || r.status === 'reviewed').map((r) => r.id),
  );

  const selectedEligible = [...selected].filter((id) => eligibleIds.has(id));

  function toggleRow(id: string) {
    if (!eligibleIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedEligible.length === eligibleIds.size) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  }

  async function bulkApprove() {
    if (selectedEligible.length === 0) return;
    setBulkState({ kind: 'running' });
    try {
      const res = await fetch('/api/bulk-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestIds: selectedEligible }),
      });
      const body = (await res.json()) as {
        succeeded: string[];
        failed: { id: string; certNumber: string | null; error: string }[];
      };
      setBulkState({ kind: 'done', succeeded: body.succeeded.length, failed: body.failed });
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setBulkState({
        kind: 'done',
        succeeded: 0,
        failed: selectedEligible.map((id) => ({
          id,
          certNumber: null,
          error: err instanceof Error ? err.message : 'Network error',
        })),
      });
    }
  }

  const allEligibleSelected =
    eligibleIds.size > 0 && selectedEligible.length === eligibleIds.size;

  return (
    <div>
      {/* Bulk action toolbar */}
      {eligibleIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleAll}
            className="focus-ring caps inline-flex items-center gap-1.5 rounded border border-hairline-strong bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            {allEligibleSelected ? 'Deselect all' : `Select all eligible (${eligibleIds.size})`}
          </button>
          {selectedEligible.length > 0 && (
            <button
              type="button"
              onClick={bulkApprove}
              disabled={bulkState.kind === 'running'}
              className="focus-ring inline-flex items-center gap-2 rounded-md bg-success px-4 py-1.5 text-sm font-semibold text-white transition-all hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bulkState.kind === 'running'
                ? 'Sending…'
                : `Approve & send ${selectedEligible.length} selected`}
            </button>
          )}
          {bulkState.kind === 'done' && (
            <span className="text-sm text-ink-muted">
              {bulkState.succeeded > 0 && (
                <span className="font-semibold text-success">{bulkState.succeeded} sent. </span>
              )}
              {bulkState.failed.length > 0 && (
                <span className="font-semibold text-danger">
                  {bulkState.failed.length} failed.
                </span>
              )}
            </span>
          )}
        </div>
      )}

      {/* Failures detail */}
      {bulkState.kind === 'done' && bulkState.failed.length > 0 && (
        <div className="mb-4 border border-danger/30 bg-danger-soft/30 px-4 py-3">
          <p className="caps mb-2 text-[0.6rem] font-semibold text-danger">Failed to send</p>
          <ul className="space-y-1">
            {bulkState.failed.map((f) => (
              <li key={f.id} className="font-mono text-[0.72rem] text-ink">
                {f.certNumber ?? f.id.slice(0, 8)} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border-y border-hairline">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="w-10 px-3 py-3">
                <span className="sr-only">Select</span>
              </th>
              <Th>Certificate</Th>
              <Th>Insured</Th>
              <Th>Holder</Th>
              <Th>Status</Th>
              <Th>AI Review</Th>
              <Th align="right">Received</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const counts = flagCounts(r.reviewer_flags ?? []);
              const isEligible = eligibleIds.has(r.id);
              const isSelected = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={`group border-b border-hairline last:border-b-0 transition-colors hover:bg-paper-deep/50 ${
                    isSelected ? 'bg-brand-soft/20' : ''
                  }`}
                >
                  <td className="px-3 py-4 align-middle">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!isEligible}
                      onChange={() => toggleRow(r.id)}
                      className="h-4 w-4 rounded-[3px] border-hairline-strong text-brand disabled:cursor-not-allowed disabled:opacity-30 focus:ring-brand/40"
                      aria-label={`Select ${r.cert_number}`}
                    />
                  </td>
                  <Td>
                    <Link
                      href={`/admin/queue/${r.id}`}
                      className="focus-ring -m-1 inline-block rounded p-1 font-mono text-[0.78rem] font-medium text-ink"
                    >
                      {r.cert_number}
                    </Link>
                  </Td>
                  <Td>
                    <span className="font-medium text-[0.92rem] text-ink">
                      {r.client?.business_name ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[0.9rem] text-ink-muted">{r.holder_name}</span>
                  </Td>
                  <Td>
                    <StatusPill status={r.status} />
                  </Td>
                  <Td>
                    <AiReviewIndicator
                      pass={r.reviewer_pass}
                      errors={counts.errors}
                      warnings={counts.warnings}
                    />
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.75rem] text-ink-faint">
                      {relativeTime(r.requested_at)}
                    </span>
                  </Td>
                  <td className="py-4 pl-3 pr-2 text-right align-middle">
                    <Link
                      href={`/admin/queue/${r.id}`}
                      className="focus-ring inline-flex items-center gap-1 rounded text-[0.78rem] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Review
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AiReviewIndicator({
  pass,
  errors,
  warnings,
}: {
  pass: boolean | null;
  errors: number;
  warnings: number;
}) {
  if (pass === null) {
    return (
      <span className="caps inline-flex items-center gap-1.5 text-[0.65rem] text-ink-faint">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink-muted opacity-50" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-ink-muted" />
        </span>
        Reviewing
      </span>
    );
  }
  if (pass && errors === 0 && warnings === 0) {
    return (
      <span className="caps inline-flex items-center gap-1.5 text-[0.65rem] font-semibold text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Clean
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-[0.75rem]">
      {errors > 0 && (
        <span className="inline-flex items-center gap-1 font-mono font-medium text-danger">
          <span className="h-1.5 w-1.5 rounded-full bg-danger" />
          {errors}
        </span>
      )}
      {warnings > 0 && (
        <span className="inline-flex items-center gap-1 font-mono font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          {warnings}
        </span>
      )}
      {errors === 0 && warnings === 0 && (
        <span className="caps text-[0.65rem] text-ink-faint">No flags</span>
      )}
    </span>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`caps px-3 py-3 text-[0.6rem] font-semibold text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-4 align-middle ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </td>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
