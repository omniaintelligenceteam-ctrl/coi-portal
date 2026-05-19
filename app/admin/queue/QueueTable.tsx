'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { createClient } from '@/lib/supabase/browser';
import { useQueueShortcuts } from '../useQueueShortcuts';
import { ShortcutHelp } from '../ShortcutHelp';

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

const BULK_UNDO_MS = 8000;

export function QueueTable({ rows: initialRows }: { rows: QueueRow[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<QueueRow[]>(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<BulkState>({ kind: 'idle' });
  const [focusIdx, setFocusIdx] = useState<number>(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newRowIds, setNewRowIds] = useState<Set<string>>(new Set());

  // Sync rows when server data changes (e.g., navigation refresh)
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const eligibleIds = new Set(
    rows.filter((r) => r.status === 'pending' || r.status === 'reviewed').map((r) => r.id),
  );

  const selectedEligible = [...selected].filter((id) => eligibleIds.has(id));

  const toggleRow = useCallback(
    (id: string) => {
      if (!eligibleIds.has(id)) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    // eligibleIds derives from rows
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  function toggleAll() {
    if (selectedEligible.length === eligibleIds.size) {
      setSelected(new Set());
    } else {
      setSelected(new Set(eligibleIds));
    }
  }

  // Core bulk-approve fetch — extracted so it can be deferred behind an undo toast.
  const executeBulkApprove = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setBulkState({ kind: 'running' });
      try {
        const res = await fetch('/api/bulk-approve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ requestIds: ids }),
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
          failed: ids.map((id) => ({
            id,
            certNumber: null,
            error: err instanceof Error ? err.message : 'Network error',
          })),
        });
      }
    },
    [router],
  );

  // Bulk-approve trigger now offers an 8s undo window via sonner.
  function bulkApprove() {
    const ids = selectedEligible;
    if (ids.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) executeBulkApprove(ids);
    }, BULK_UNDO_MS);

    toast(`Approved ${ids.length} cert${ids.length === 1 ? '' : 's'}. Sending in 8s.`, {
      duration: BULK_UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          cancelled = true;
          clearTimeout(timer);
        },
      },
    });
  }

  // Realtime: subscribe to inserts/updates on cert_requests.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-queue-cert-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'cert_requests' },
        (payload) => {
          const fresh = payload.new as Partial<QueueRow> & {
            id: string;
            status?: CertStatus;
          };
          if (fresh.status !== 'pending' && fresh.status !== 'reviewed') return;
          setRows((prev) => {
            if (prev.some((r) => r.id === fresh.id)) return prev;
            const stub: QueueRow = {
              id: fresh.id,
              cert_number: fresh.cert_number ?? '—',
              holder_name: fresh.holder_name ?? '—',
              status: (fresh.status ?? 'pending') as CertStatus,
              requested_at: fresh.requested_at ?? new Date().toISOString(),
              reviewer_pass: fresh.reviewer_pass ?? null,
              reviewer_flags: fresh.reviewer_flags ?? [],
              client: null,
            };
            return [...prev, stub];
          });
          setNewRowIds((prev) => {
            const next = new Set(prev);
            next.add(fresh.id);
            return next;
          });
          // hydrate the rest (client name) from the server
          router.refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'cert_requests' },
        (payload) => {
          const updated = payload.new as Partial<QueueRow> & { id: string; status?: CertStatus };
          setRows((prev) => {
            // If row no longer fits the queue filter, drop it.
            if (updated.status && updated.status !== 'pending' && updated.status !== 'reviewed') {
              return prev.filter((r) => r.id !== updated.id);
            }
            return prev.map((r) =>
              r.id === updated.id ? { ...r, ...(updated as Partial<QueueRow>) } : r,
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  // Keep focus index in range as rows change.
  useEffect(() => {
    if (rows.length === 0) {
      if (focusIdx !== -1) setFocusIdx(-1);
      return;
    }
    if (focusIdx >= rows.length) setFocusIdx(rows.length - 1);
  }, [rows, focusIdx]);

  // Single-row approve via API (used by keyboard `a`).
  async function approveOne(id: string) {
    if (!eligibleIds.has(id)) return;
    try {
      await fetch('/api/bulk-approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestIds: [id] }),
      });
      router.refresh();
    } catch {
      // realtime will pick up the change anyway; surface nothing here.
    }
  }

  // Keyboard shortcut handlers
  const focused = focusIdx >= 0 && focusIdx < rows.length ? rows[focusIdx] : null;

  useQueueShortcuts({
    onDown: () => setFocusIdx((i) => Math.min(rows.length - 1, i < 0 ? 0 : i + 1)),
    onUp: () => setFocusIdx((i) => Math.max(0, i < 0 ? 0 : i - 1)),
    onOpen: () => {
      if (focused) router.push(`/admin/queue/${focused.id}`);
    },
    onApprove: () => {
      if (focused && eligibleIds.has(focused.id)) approveOne(focused.id);
    },
    onReject: () => {
      if (focused) router.push(`/admin/queue/${focused.id}?action=reject`);
    },
    onToggleSelect: () => {
      if (focused) toggleRow(focused.id);
    },
    onBulkApprove: () => bulkApprove(),
    onToggleHelp: () => setHelpOpen((v) => !v),
    onFocusSearch: () => {
      const el = document.querySelector<HTMLInputElement>(
        'input[type="search"], input[name="search"], input[data-queue-search]',
      );
      if (el) el.focus();
    },
  });

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

      {/* Mobile card stack — under sm */}
      <ul className="space-y-3 sm:hidden">
        {rows.map((r, idx) => {
          const counts = flagCounts(r.reviewer_flags ?? []);
          const isEligible = eligibleIds.has(r.id);
          const isSelected = selected.has(r.id);
          const isFocused = idx === focusIdx;
          const isNew = newRowIds.has(r.id);
          return (
            <motion.li
              key={r.id}
              initial={isNew && !reduce ? { opacity: 0, y: -4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className={`mobile-card ${isSelected ? 'bg-brand-soft/20' : ''} ${
                isFocused ? 'ring-2 ring-brand/40 ring-offset-1 ring-offset-paper' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/queue/${r.id}`}
                    className="focus-ring -m-1 inline-block rounded p-1 font-mono text-[0.85rem] font-semibold text-ink"
                  >
                    {r.cert_number}
                  </Link>
                  <p className="mt-1 truncate font-medium text-[0.95rem] text-ink">
                    {r.client?.business_name ?? '—'}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isEligible}
                  onChange={() => toggleRow(r.id)}
                  className="tap-target h-5 w-5 shrink-0 rounded-[3px] border-hairline-strong text-brand disabled:cursor-not-allowed disabled:opacity-30 focus:ring-brand/40"
                  aria-label={`Select ${r.cert_number}`}
                />
              </div>
              <dl className="mt-3">
                <div className="mobile-card-row">
                  <dt>Holder</dt>
                  <dd className="text-[0.85rem]">{r.holder_name}</dd>
                </div>
                <div className="mobile-card-row">
                  <dt>Status</dt>
                  <dd><StatusPill status={r.status} /></dd>
                </div>
                <div className="mobile-card-row">
                  <dt>AI review</dt>
                  <dd>
                    <AiReviewIndicator
                      pass={r.reviewer_pass}
                      errors={counts.errors}
                      warnings={counts.warnings}
                    />
                  </dd>
                </div>
                <div className="mobile-card-row">
                  <dt>Received</dt>
                  <dd className="font-mono text-[0.78rem] text-ink-faint">
                    {relativeTime(r.requested_at)}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/admin/queue/${r.id}`}
                className="focus-ring tap-target mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
              >
                Review request
                <ArrowRight className="h-4 w-4" />
              </Link>
            </motion.li>
          );
        })}
      </ul>

      {/* Desktop table — sm and up */}
      <div className="hidden border-y border-hairline sm:block">
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
            <AnimatePresence initial={false}>
              {rows.map((r, idx) => {
                const counts = flagCounts(r.reviewer_flags ?? []);
                const isEligible = eligibleIds.has(r.id);
                const isSelected = selected.has(r.id);
                const isFocused = idx === focusIdx;
                const isNew = newRowIds.has(r.id);
                return (
                  <motion.tr
                    key={r.id}
                    initial={isNew && !reduce ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                    className={`group border-b border-hairline last:border-b-0 transition-colors hover:bg-paper-deep/50 ${
                      isSelected ? 'bg-brand-soft/20' : ''
                    } ${isFocused ? 'bg-paper-deep shadow-[inset_2px_0_0_0_var(--color-brand)]' : ''}`}
                    onClick={() => setFocusIdx(idx)}
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
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>

        {/* Keyboard cheat-strip — visible on desktop */}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1 pb-1 pt-2">
          <ShortcutHint keys={['j', 'k']} label="Move" />
          <ShortcutHint keys={['Enter']} label="Open" />
          <ShortcutHint keys={['a']} label="Approve" />
          <ShortcutHint keys={['?']} label="More" />
        </div>
      </div>

      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}

function ShortcutHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-ink-faint">
      {keys.map((k, i) => (
        <kbd
          key={i}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-hairline-strong bg-white px-1 font-mono text-[0.65rem] font-medium text-ink-muted"
        >
          {k}
        </kbd>
      ))}
      <span className="caps text-[0.58rem] font-medium tracking-caps">{label}</span>
    </span>
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
      <span
        className="caps inline-flex items-center gap-1.5 text-[0.65rem] text-ink-faint"
        role="status"
        aria-live="polite"
      >
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
      <span
        className="caps inline-flex items-center gap-1.5 text-[0.65rem] font-semibold text-success"
        role="status"
        aria-live="polite"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Clean
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-2 text-[0.75rem]"
      role="status"
      aria-live="polite"
    >
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
