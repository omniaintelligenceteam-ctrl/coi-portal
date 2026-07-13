'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Save } from 'lucide-react';
import { Button, Input, Toggle } from '@/app/components/ui';

type Requirements = {
  requiredCoverageTypes?: string[];
  requiredLimits?: Record<string, Record<string, number>>;
  requiresAdditionalInsured?: boolean;
  requiresWaiverOfSubrogation?: boolean;
  requiresPrimaryNoncontributory?: boolean;
  notes?: string;
};

const COVERAGE_TYPES = ['GL', 'WC', 'AUTO', 'UMBRELLA'] as const;

/**
 * Per-holder contract requirements editor (Holders tab). Saved requirements
 * feed the deterministic requirements gate — a mismatch on any future cert
 * for this holder forces manual review.
 */
export function HolderRequirementsEditor({
  holderId,
  initial,
}: {
  holderId: string;
  initial: Requirements | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<string[]>(initial?.requiredCoverageTypes ?? []);
  const [glOcc, setGlOcc] = useState<number>(initial?.requiredLimits?.GL?.eachOccurrence ?? 0);
  const [glAgg, setGlAgg] = useState<number>(initial?.requiredLimits?.GL?.generalAggregate ?? 0);
  const [ai, setAi] = useState(Boolean(initial?.requiresAdditionalInsured));
  const [wos, setWos] = useState(Boolean(initial?.requiresWaiverOfSubrogation));
  const [pnc, setPnc] = useState(Boolean(initial?.requiresPrimaryNoncontributory));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const hasAny =
    types.length > 0 || glOcc > 0 || glAgg > 0 || ai || wos || pnc || notes.trim().length > 0;

  function toggleType(t: string) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const glLimits: Record<string, number> = {};
      if (glOcc > 0) glLimits.eachOccurrence = glOcc;
      if (glAgg > 0) glLimits.generalAggregate = glAgg;

      const requirements: Requirements | null = hasAny
        ? {
            ...(types.length > 0 ? { requiredCoverageTypes: types } : {}),
            ...(Object.keys(glLimits).length > 0 ? { requiredLimits: { GL: glLimits } } : {}),
            ...(ai ? { requiresAdditionalInsured: true } : {}),
            ...(wos ? { requiresWaiverOfSubrogation: true } : {}),
            ...(pnc ? { requiresPrimaryNoncontributory: true } : {}),
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }
        : null;

      const res = await fetch('/api/admin/holder-requirements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ holderId, requirements }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        toast.error(payload.error || `Save failed (${res.status}).`);
        return;
      }
      toast.success(
        requirements
          ? 'Requirements saved — future certs for this holder are checked against them.'
          : 'Requirements cleared.',
      );
      router.refresh();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring caps inline-flex items-center gap-1 text-[0.62rem] font-semibold text-brand hover:text-brand-deep"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        Requirements
        {initial && !open && (
          <span className="caps ml-1 rounded-[3px] border border-seal/30 bg-seal-soft px-1.5 py-0.5 text-[0.55rem] font-semibold text-seal-deep">
            on file
          </span>
        )}
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          <div>
            <p className="caps mb-2 text-[0.6rem] font-semibold text-ink-faint">
              Required coverage types
            </p>
            <div className="flex flex-wrap gap-2">
              {COVERAGE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`focus-ring caps rounded-md border px-3 py-1.5 text-[0.62rem] font-semibold transition-colors ${
                    types.includes(t)
                      ? 'border-brand bg-brand-soft/50 text-brand-deep'
                      : 'border-hairline-strong bg-white text-ink-muted hover:text-ink'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="GL each occurrence — minimum"
              type="number"
              min={0}
              step={100000}
              value={glOcc}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setGlOcc(Number.isNaN(n) ? 0 : n);
              }}
              hint="0 = no minimum"
            />
            <Input
              label="GL general aggregate — minimum"
              type="number"
              min={0}
              step={100000}
              value={glAgg}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setGlAgg(Number.isNaN(n) ? 0 : n);
              }}
              hint="0 = no minimum"
            />
          </div>

          <div className="space-y-3">
            <Toggle
              checked={ai}
              onChange={(e) => setAi(e.target.checked)}
              label="Requires Additional Insured"
            />
            <Toggle
              checked={wos}
              onChange={(e) => setWos(e.target.checked)}
              label="Requires Waiver of Subrogation"
            />
            <Toggle
              checked={pnc}
              onChange={(e) => setPnc(e.target.checked)}
              label="Requires Primary & Noncontributory"
            />
          </div>

          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. per master service agreement dated 03/2026"
            maxLength={2000}
          />

          <div className="flex items-center justify-end gap-3 border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              leadingIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {hasAny ? 'Save requirements' : 'Clear requirements'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
