'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, Send } from 'lucide-react';
import { StatusPill, type CertStatus } from '@/app/components/StatusPill';
import { useRowPulse } from '@/app/components/motion';
import { Button, ButtonLink, Banner } from '@/app/components/ui';
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
  // Tracks updated_at-like signatures per row so realtime UPDATEs trigger
  // a one-shot row-pulse glow (Tier 1 #8). Map<rowId, signature>.
  const [updateSig, setUpdateSig] = useState<Map<string, string>>(new Map());
  // True only during the initial render window. Used to gate first-paint
  // stagger so realtime inserts later don't waterfall (Tier 1 #1).
  const [isInitial, setIsInitial] = useState(true);

  // Sync rows when server data changes (e.g., navigation refresh)
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  // Close the first-paint window after a single tick so any realtime
  // inserts after this point use their own (isNew) entry animation
  // instead of the staggered cascade.
  useEffect(() => {
    const t = setTimeout(() => setIsInitial(false), 600);
    return () => clearTimeout(t);
  }, []);

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

  // Bulk-approve trigger now offers an 8s undo window via sonner, with
  // a thin countdown bar that bleeds left-to-right so the admin can see
  // exactly how long they have to undo (Tier 1 #2).
  function bulkApprove() {
    const ids = selectedEligible;
    if (ids.length === 0) return;

    // Tier 2 #11: optimistic halo across all selected rows — the bulk
    // approve action reads as one synchronized "ratified" wash even
    // before the request is sent.
    pulseRowsOptimistically(ids);

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) executeBulkApprove(ids);
    }, BULK_UNDO_MS);

    const count = ids.length;
    toast.custom(
      (id) => (
        <div className="relative w-80 overflow-hidden rounded-md border border-hairline-strong bg-paper shadow-lift">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="text-[0.85rem] text-ink">
              Approved <span className="font-mono font-semibold">{count}</span> cert
              {count === 1 ? '' : 's'}. Sending in 8s.
            </span>
            <button
              type="button"
              onClick={() => {
                cancelled = true;
                clearTimeout(timer);
                toast.dismiss(id);
              }}
              className="focus-ring caps -m-1 rounded p-1 text-[0.62rem] font-semibold text-brand hover:text-brand-deep"
            >
              Undo
            </button>
          </div>
          <div
            aria-hidden="true"
            className="toast-countdown absolute bottom-0 left-0 h-[2px] w-full bg-brand"
            style={{ ['--countdown-duration' as never]: `${BULK_UNDO_MS}ms` }}
          />
        </div>
      ),
      { duration: BULK_UNDO_MS },
    );
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
          // Tier 1 #8: pulse the row so the admin's eye catches the change.
          // The signature is a per-event timestamp; useRowPulse re-fires
          // whenever the value changes.
          setUpdateSig((prev) => {
            const next = new Map(prev);
            next.set(updated.id, `${Date.now()}`);
            return next;
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
    // Tier 2 #11: optimistic row-pulse fires BEFORE the network round trip
    // so the admin's `a` keystroke gets instant visual confirmation. The
    // realtime UPDATE later will fire a second pulse (the two overlap and
    // read as one continuous halo).
    pulseRowsOptimistically([id]);
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

  // Helper: instantly retrigger row-pulse on the given ids by bumping
  // their updateSig signatures. Pure UI feedback — does no network work.
  function pulseRowsOptimistically(ids: string[]) {
    if (ids.length === 0) return;
    setUpdateSig((prev) => {
      const next = new Map(prev);
      const stamp = `optimistic-${Date.now()}`;
      for (const id of ids) next.set(id, `${stamp}-${id}`);
      return next;
    });
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
        <div className="mb-5 flex flex-wrap items-center gap-2.5 sm:gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            uppercase
            onClick={toggleAll}
          >
            {allEligibleSelected ? 'Deselect all' : `Select all (${eligibleIds.size})`}
          </Button>
          {selectedEligible.length > 0 && (
            <Button
              type="button"
              onClick={bulkApprove}
              loading={bulkState.kind === 'running'}
              size="sm"
              leadingIcon={
                bulkState.kind !== 'running' ? (
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                ) : null
              }
              className="bg-success hover:bg-success/90 active:bg-success/95 disabled:bg-success/60"
            >
              {bulkState.kind === 'running'
                ? 'Sending…'
                : `Approve & send ${selectedEligible.length}`}
            </Button>
          )}
          {bulkState.kind === 'done' && (
            <span className="text-[0.8125rem] text-ink-muted">
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
        <div className="mb-5">
          <Banner tone="danger" title="Failed to send">
            <ul className="space-y-1">
              {bulkState.failed.map((f) => (
                <li key={f.id} className="font-mono text-[0.75rem] text-ink">
                  {f.certNumber ?? f.id.slice(0, 8)} — {f.error}
                </li>
              ))}
            </ul>
          </Banner>
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
            <PulseLi
              key={r.id}
              pulseKey={updateSig.get(r.id)}
              isFirstPaint={isInitial && !isNew}
              isNew={isNew}
              idx={idx}
              reduce={Boolean(reduce)}
              className={`relative rounded-[var(--r-md)] border border-hairline bg-card p-4 shadow-card transition-colors ${
                isSelected ? 'border-brand/40 bg-brand-soft/30' : ''
              } ${isFocused ? 'ring-2 ring-brand/40 ring-offset-1 ring-offset-paper' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/queue/${r.id}`}
                      className="focus-ring num-tabular -m-1 inline-block rounded p-1 font-mono text-[0.8rem] font-semibold text-ink"
                    >
                      {r.cert_number}
                    </Link>
                    <span className="num-tabular font-mono text-[0.72rem] text-ink-faint">
                      &middot; {relativeTime(r.requested_at)}
                    </span>
                  </div>
                  <p className="font-display mt-1.5 truncate text-[1.05rem] font-medium leading-[1.2] text-ink">
                    {r.client?.business_name ?? '—'}
                  </p>
                  <p className="mt-0.5 truncate text-[0.8125rem] text-ink-muted">
                    To {r.holder_name}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={!isEligible}
                  onChange={() => toggleRow(r.id)}
                  className="tap-target mt-1 h-5 w-5 shrink-0 rounded-[3px] border-hairline-strong text-brand disabled:cursor-not-allowed disabled:opacity-30 focus:ring-brand/40"
                  aria-label={`Select ${r.cert_number}`}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hairline pt-3">
                <StatusPill status={r.status} />
                <AiReviewIndicator
                  pass={r.reviewer_pass}
                  errors={counts.errors}
                  warnings={counts.warnings}
                />
              </div>
              <ButtonLink
                href={`/admin/queue/${r.id}`}
                size="md"
                fullWidth
                trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
                className="mt-4"
              >
                Review request
              </ButtonLink>
            </PulseLi>
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
                  <PulseTr
                    key={r.id}
                    pulseKey={updateSig.get(r.id)}
                    isFirstPaint={isInitial && !isNew}
                    isNew={isNew}
                    idx={idx}
                    reduce={Boolean(reduce)}
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
                  </PulseTr>
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

/**
 * Row wrapper for the mobile card list. Handles:
 *   - first-paint stagger (so the list reveals in order on mount)
 *   - realtime-update pulse (row-pulse class fires when `pulseKey` changes)
 *   - new-row entry animation (when Supabase INSERT delivers it)
 */
function PulseLi({
  pulseKey,
  isFirstPaint,
  isNew,
  idx,
  reduce,
  className,
  children,
}: {
  pulseKey: unknown;
  isFirstPaint: boolean;
  isNew: boolean;
  idx: number;
  reduce: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRowPulse<HTMLLIElement>(pulseKey);
  return (
    <motion.li
      ref={ref}
      initial={
        reduce
          ? false
          : isNew
          ? { opacity: 0, y: -4 }
          : isFirstPaint
          ? { opacity: 0, y: 6 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.32,
        ease: [0.16, 1, 0.3, 1],
        delay: isFirstPaint && idx < 8 ? idx * 0.04 : 0,
      }}
      className={className}
    >
      {children}
    </motion.li>
  );
}

/** Desktop table-row twin of {@link PulseLi}. */
function PulseTr({
  pulseKey,
  isFirstPaint,
  isNew,
  idx,
  reduce,
  className,
  onClick,
  children,
}: {
  pulseKey: unknown;
  isFirstPaint: boolean;
  isNew: boolean;
  idx: number;
  reduce: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const ref = useRowPulse<HTMLTableRowElement>(pulseKey);
  return (
    <motion.tr
      ref={ref}
      initial={
        reduce
          ? false
          : isNew
          ? { opacity: 0 }
          : isFirstPaint
          ? { opacity: 0, y: 4 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.32,
        ease: [0.16, 1, 0.3, 1],
        delay: isFirstPaint && idx < 8 ? idx * 0.04 : 0,
      }}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.tr>
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

