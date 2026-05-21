'use client';

/**
 * Limits editor — Master File workstream's keystone.
 *
 * Per-policy inline editor for everything the ACORD 25 reads from a policy:
 *   - Numeric limits per coverage type (limits_jsonb)
 *   - Additional Insured blanket flag
 *   - Waiver of Subrogation flag
 *   - Per-policy description (the row that lands in the OTHER coverage line
 *     when the policy is EQUIPMENT/OTHER, and as a flag-line for GL/etc.)
 *
 * Why this exists: prior to this commit Brook could only set limits via
 * dec-page import or direct SQL. Now she opens any policy in the Master File
 * tab, taps "Edit limits", types numbers, saves.
 *
 * Save path: POST /api/admin/update-policy (existing route already handles
 * the limits_jsonb merge + boolean toggles + description). Limits are sent
 * as a complete coverage-typed object so the route's REPLACE semantics
 * don't drop unrelated fields.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Save } from 'lucide-react';
import { Banner, Button, Input, Textarea, Toggle } from '@/app/components/ui';

type PolicyType = 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';

export type LimitsEditorPolicy = {
  id: string;
  type: PolicyType;
  policy_number: string;
  limits_jsonb: Record<string, number> | null;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
};

type FieldDef = { key: string; label: string; required?: boolean; hint?: string };

const FIELD_DEFS: Record<PolicyType, FieldDef[]> = {
  GL: [
    { key: 'eachOccurrence', label: 'Each occurrence', required: true },
    { key: 'damageToRented', label: 'Damage to rented premises' },
    { key: 'medExp', label: 'Medical expense (any one person)' },
    { key: 'personalAdvInjury', label: 'Personal & advertising injury' },
    { key: 'generalAggregate', label: 'General aggregate', required: true },
    { key: 'productsCompOp', label: 'Products / completed ops aggregate' },
  ],
  AUTO: [
    { key: 'combinedSingleLimit', label: 'Combined single limit (CSL)', hint: 'Either CSL OR split limits' },
    { key: 'bodilyInjuryPerPerson', label: 'Bodily injury — per person' },
    { key: 'bodilyInjuryPerAccident', label: 'Bodily injury — per accident' },
    { key: 'propertyDamage', label: 'Property damage' },
  ],
  WC: [
    { key: 'eachAccident', label: 'Each accident', required: true },
    { key: 'diseaseEaEmployee', label: 'Disease — each employee', required: true },
    { key: 'diseasePolicyLimit', label: 'Disease — policy limit', required: true },
  ],
  UMBRELLA: [
    { key: 'eachOccurrence', label: 'Each occurrence', required: true },
    { key: 'aggregate', label: 'Aggregate', required: true },
    { key: 'retention', label: 'Self-insured retention' },
  ],
  EQUIPMENT: [
    { key: 'equipmentLimit', label: 'Equipment limit', required: true },
  ],
  OTHER: [
    { key: 'equipmentLimit', label: 'Limit' },
  ],
};

const TYPE_LABEL: Record<PolicyType, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

function formatMoney(n: number | undefined | null): string {
  if (n === null || n === undefined) return '—';
  if (n === 0) return '—';
  return `$${n.toLocaleString('en-US')}`;
}

export function LimitsEditor({ policy }: { policy: LimitsEditorPolicy }) {
  const fields = FIELD_DEFS[policy.type] ?? [];

  const [open, setOpen] = useState(false);
  const [limits, setLimits] = useState<Record<string, number>>(() => limitsFromPolicy(policy));
  const [addlInsured, setAddlInsured] = useState(policy.addl_insured_blanket);
  const [wos, setWos] = useState(policy.subrogation_waived);
  const [description, setDescription] = useState(policy.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // If the parent re-fetches and passes a new policy, reset local state.
  useEffect(() => {
    setLimits(limitsFromPolicy(policy));
    setAddlInsured(policy.addl_insured_blanket);
    setWos(policy.subrogation_waived);
    setDescription(policy.description ?? '');
  }, [policy.id, policy.limits_jsonb, policy.addl_insured_blanket, policy.subrogation_waived, policy.description]);

  const dirty = useMemo(() => {
    const original = limitsFromPolicy(policy);
    if (
      addlInsured !== policy.addl_insured_blanket ||
      wos !== policy.subrogation_waived ||
      (description ?? '') !== (policy.description ?? '')
    ) {
      return true;
    }
    for (const f of fields) {
      if ((limits[f.key] ?? 0) !== (original[f.key] ?? 0)) return true;
    }
    return false;
  }, [policy, addlInsured, wos, description, limits, fields]);

  const requiredMissing = fields.filter((f) => f.required && !((limits[f.key] ?? 0) > 0));

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      // Build a clean limits_jsonb with only fields meaningful to this type.
      // We REPLACE the whole limits_jsonb on the server, so we need to send
      // every field this coverage type cares about — even unchanged ones.
      const cleanLimits: Record<string, number> = {};
      for (const f of fields) {
        const v = limits[f.key];
        if (typeof v === 'number' && v > 0) cleanLimits[f.key] = v;
      }

      const res = await fetch('/api/admin/update-policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          policyId: policy.id,
          limits: cleanLimits,
          addlInsuredBlanket: addlInsured,
          subrogationWaived: wos,
          description: description.trim() || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        const message = payload.detail || payload.error || `Request failed (${res.status}).`;
        setError(message);
        toast.error(message);
        return;
      }
      toast.success(`${TYPE_LABEL[policy.type]} limits updated.`);
      router.refresh();
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[var(--r-md)] border border-hairline bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center justify-between gap-4 rounded-t-[var(--r-md)] px-5 py-4 text-left transition-colors hover:bg-paper-deep/40"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-[1.05rem] font-semibold text-ink">
              {TYPE_LABEL[policy.type]}
            </span>
            <span className="caps rounded-[3px] bg-paper-deep px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink-muted">
              {policy.type}
            </span>
            <span className="font-mono text-[0.78rem] text-ink-faint">{policy.policy_number}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.78rem] text-ink-muted">
            {fields.slice(0, 3).map((f) => {
              const v = policy.limits_jsonb?.[f.key];
              const missing = f.required && !(typeof v === 'number' && v > 0);
              return (
                <span key={f.key} className={missing ? 'text-danger' : ''}>
                  {f.label}: <span className="num-tabular font-mono">{formatMoney(v)}</span>
                </span>
              );
            })}
            {fields.length > 3 && (
              <span className="text-ink-faint">+{fields.length - 3} more</span>
            )}
          </div>
          {(policy.addl_insured_blanket || policy.subrogation_waived) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {policy.addl_insured_blanket && (
                <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                  AI · blanket
                </span>
              )}
              {policy.subrogation_waived && (
                <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                  Waiver of subrogation
                </span>
              )}
            </div>
          )}
        </div>
        <span className="caps inline-flex items-center gap-1 text-[0.62rem] font-semibold text-brand">
          {open ? 'Close' : 'Edit'}
          {open ? <ChevronDown className="h-3 w-3" aria-hidden="true" /> : <ChevronRight className="h-3 w-3" aria-hidden="true" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-hairline px-5 py-5">
          <h4 className="caps mb-3 text-[0.6rem] font-semibold text-ink-faint">Limits</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((f) => (
              <Input
                key={f.key}
                label={f.label + (f.required ? ' *' : '')}
                type="number"
                min={0}
                step={1000}
                value={limits[f.key] ?? 0}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setLimits((prev) => ({ ...prev, [f.key]: Number.isNaN(n) ? 0 : n }));
                }}
                hint={f.hint}
              />
            ))}
          </div>

          {requiredMissing.length > 0 && (
            <p className="mt-3 text-[0.78rem] text-danger">
              Required: {requiredMissing.map((f) => f.label).join(', ')}
            </p>
          )}

          <h4 className="caps mt-7 mb-3 text-[0.6rem] font-semibold text-ink-faint">Endorsements</h4>
          <div className="space-y-3">
            <Toggle
              checked={addlInsured}
              onChange={(e) => setAddlInsured(e.target.checked)}
              label="Additional insured — blanket"
              description="When checked, every cert request that includes this coverage prints with AI · blanket. Skip for per-cert AI."
            />
            <Toggle
              checked={wos}
              onChange={(e) => setWos(e.target.checked)}
              label="Waiver of subrogation"
              description="On if the underlying policy carries a blanket waiver of subrogation. Off if WoS is granted per cert."
            />
          </div>

          <h4 className="caps mt-7 mb-3 text-[0.6rem] font-semibold text-ink-faint">Description</h4>
          <Textarea
            label="Policy description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={policy.type === 'EQUIPMENT' ? 'e.g. Contractors Equipment — leased & rented' : 'Optional. Prints in the bottom OTHER row of the cert if used.'}
            maxLength={2000}
          />

          {error && (
            <div className="mt-4">
              <Banner tone="danger">{error}</Banner>
            </div>
          )}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-hairline pt-4">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              loading={submitting}
              disabled={!dirty}
              leadingIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Save policy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function limitsFromPolicy(p: LimitsEditorPolicy): Record<string, number> {
  return Object.fromEntries(
    Object.entries(p.limits_jsonb ?? {}).filter(([, v]) => typeof v === 'number'),
  ) as Record<string, number>;
}
