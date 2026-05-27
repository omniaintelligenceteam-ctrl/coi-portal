'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Edit3, X } from 'lucide-react';
import { ActionBar, Button, RadioCard } from '@/app/components/ui';
import type {
  AgencyOverride,
  CertOverrides,
  CoverageOverride,
  InsuredOverride,
} from '@/lib/types';
import { PdfPreviewModal } from './PdfPreviewModal';

type Decision = 'approve' | 'edit' | 'reject';
type EditTab = 'holder' | 'insured' | 'producer' | 'coverages' | 'description';

type HolderEdit = { name: string; address1: string; address2: string };

type AgencyEdit = {
  name: string;
  address1: string;
  address2: string;
  contactName: string;
  phone: string;
  fax: string;
  email: string;
};

type InsuredEdit = { name: string; address1: string; address2: string };

export type EditableCoverage = {
  policyId: string;
  type: string;
  policyNumber: string;
  effDate: string; // 'YYYY-MM-DD'
  expDate: string; // 'YYYY-MM-DD'
  addlInsuredBlanket: boolean;
  subrogationWaived: boolean;
  description: string;
  limits: Record<string, number>;
  insurerName: string;
  insurerNaic: string;
  // GL
  claimsMade?: boolean;
  generalAggregateAppliesPer?: 'POLICY' | 'PROJECT' | 'LOC' | 'OTHER';
  generalAggregateOtherText?: string;
  // Auto
  anyAuto?: boolean;
  ownedAutosOnly?: boolean;
  scheduledAutos?: boolean;
  hiredAutosOnly?: boolean;
  nonOwnedAutosOnly?: boolean;
  // Umbrella
  excess?: boolean;
  umbClaimsMade?: boolean; // distinct from GL claimsMade — kept under the umbrella row
  deductibleVsRetention?: 'DED' | 'RETENTION';
  // WC
  officerExcluded?: boolean;
  perStatuteVsOther?: 'PER_STATUTE' | 'OTHER';
  perStatuteOtherText?: string;
};

// Type-specific limit fields shown in the per-coverage editor. Mirrors the
// shape buildCoiInput expects in policies.limits_jsonb.
const LIMIT_FIELDS: Record<string, Array<{ key: string; label: string }>> = {
  GL: [
    { key: 'eachOccurrence', label: 'Each Occurrence' },
    { key: 'damageToRented', label: 'Damage to Rented' },
    { key: 'medExp', label: 'Med Exp (any one person)' },
    { key: 'personalAdvInjury', label: 'Personal & Adv Injury' },
    { key: 'generalAggregate', label: 'General Aggregate' },
    { key: 'productsCompOp', label: 'Products / Comp / Op' },
  ],
  AUTO: [
    { key: 'combinedSingleLimit', label: 'Combined Single Limit' },
    { key: 'bodilyInjuryPerPerson', label: 'BI per person' },
    { key: 'bodilyInjuryPerAccident', label: 'BI per accident' },
    { key: 'propertyDamage', label: 'Property Damage' },
  ],
  UMBRELLA: [
    { key: 'eachOccurrence', label: 'Each Occurrence' },
    { key: 'aggregate', label: 'Aggregate' },
    { key: 'retention', label: 'Retention' },
  ],
  WC: [
    { key: 'eachAccident', label: 'E.L. Each Accident' },
    { key: 'diseaseEaEmployee', label: 'E.L. Disease — Ea Employee' },
    { key: 'diseasePolicyLimit', label: 'E.L. Disease — Policy Limit' },
  ],
  EQUIPMENT: [{ key: 'equipmentLimit', label: 'Equipment Limit' }],
  OTHER: [{ key: 'equipmentLimit', label: 'Limit' }],
};

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

function isoToUs(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

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
  currentInsured,
  currentAgency,
  currentCoverages,
  currentCertOverrides,
}: {
  requestId: string;
  clientId: string;
  currentHolder: HolderEdit;
  currentInsured: InsuredEdit;
  currentAgency: AgencyEdit;
  currentCoverages: EditableCoverage[];
  currentCertOverrides: CertOverrides;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Decision>('approve');
  const [editTab, setEditTab] = useState<EditTab>('holder');

  // Holder edit (existing column-level edit path)
  const [holder, setHolder] = useState<HolderEdit>(currentHolder);

  // Cert-level overrides — what gets persisted to cert_requests.cert_overrides.
  // Initialize from any existing overrides on the row so re-opening a saved
  // edit doesn't drop the work Brook did last time.
  const [overrides, setOverrides] = useState<CertOverrides>(currentCertOverrides ?? {});

  // Per-tab working copies. We hold them in local state and merge into
  // overrides on every change — keeps the field UI snappy and lets us strip
  // empty-string sentinel values when computing what to persist.
  const [insuredEdit, setInsuredEdit] = useState<InsuredEdit>({
    name: currentCertOverrides?.insured?.name ?? currentInsured.name,
    address1: currentCertOverrides?.insured?.address1 ?? currentInsured.address1,
    address2: currentCertOverrides?.insured?.address2 ?? currentInsured.address2,
  });
  const [agencyEdit, setAgencyEdit] = useState<AgencyEdit>({
    name: currentCertOverrides?.agency?.name ?? currentAgency.name,
    address1: currentCertOverrides?.agency?.address1 ?? currentAgency.address1,
    address2: currentCertOverrides?.agency?.address2 ?? currentAgency.address2,
    contactName: currentCertOverrides?.agency?.contactName ?? currentAgency.contactName,
    phone: currentCertOverrides?.agency?.phone ?? currentAgency.phone,
    fax: currentCertOverrides?.agency?.fax ?? currentAgency.fax,
    email: currentCertOverrides?.agency?.email ?? currentAgency.email,
  });
  const [descriptionEdit, setDescriptionEdit] = useState<string>(
    currentCertOverrides?.description ?? '',
  );
  const [revisionEdit, setRevisionEdit] = useState<string>(
    currentCertOverrides?.revisionNumber ?? '',
  );
  // Per-policy coverage edits. Each entry mirrors the EditableCoverage shape
  // but only diverges from the underlying record once the user actually types
  // into a field.
  const [coverageEdits, setCoverageEdits] = useState<Record<string, EditableCoverage>>(() => {
    const seed: Record<string, EditableCoverage> = {};
    for (const c of currentCoverages) {
      const ov = currentCertOverrides?.coverages?.[c.policyId];
      const insurerOv = currentCertOverrides?.insurers?.[c.insurerNaic];
      seed[c.policyId] = {
        ...c,
        policyNumber: ov?.policyNumber ?? c.policyNumber,
        effDate: ov?.effDate ? usToIso(ov.effDate) : c.effDate,
        expDate: ov?.expDate ? usToIso(ov.expDate) : c.expDate,
        addlInsuredBlanket: ov?.addlInsuredBlanket ?? c.addlInsuredBlanket,
        subrogationWaived: ov?.subrogationWaived ?? c.subrogationWaived,
        description: ov?.description ?? c.description,
        limits: { ...c.limits, ...filterNumbers(ov?.limits) },
        insurerName: insurerOv?.name ?? c.insurerName,
        insurerNaic: insurerOv?.naic ?? c.insurerNaic,
        // GL
        claimsMade: ov?.claimsMade ?? c.claimsMade ?? false,
        generalAggregateAppliesPer:
          ov?.generalAggregateAppliesPer ?? c.generalAggregateAppliesPer ?? 'POLICY',
        generalAggregateOtherText:
          ov?.generalAggregateOtherText ?? c.generalAggregateOtherText ?? '',
        // Auto
        anyAuto:           ov?.anyAuto ?? c.anyAuto ?? false,
        ownedAutosOnly:    ov?.ownedAutosOnly ?? c.ownedAutosOnly ?? false,
        scheduledAutos:    ov?.scheduledAutos ?? c.scheduledAutos ?? false,
        hiredAutosOnly:    ov?.hiredAutosOnly ?? c.hiredAutosOnly ?? false,
        nonOwnedAutosOnly: ov?.nonOwnedAutosOnly ?? c.nonOwnedAutosOnly ?? false,
        // Umbrella
        excess:        ov?.excess ?? c.excess ?? false,
        umbClaimsMade: ov?.claimsMade ?? c.umbClaimsMade ?? false,
        deductibleVsRetention:
          ov?.deductibleVsRetention ?? c.deductibleVsRetention ?? 'RETENTION',
        // WC
        officerExcluded:    ov?.officerExcluded ?? c.officerExcluded ?? true,
        perStatuteVsOther:  ov?.perStatuteVsOther ?? c.perStatuteVsOther ?? 'PER_STATUTE',
        perStatuteOtherText: ov?.perStatuteOtherText ?? c.perStatuteOtherText ?? '',
      };
    }
    return seed;
  });

  const [rejectReason, setRejectReason] = useState('');
  const [rememberThis, setRememberThis] = useState(false);
  const [overrideScope, setOverrideScope] = useState<'holder' | 'coverage' | 'general'>('holder');
  const [overridePattern, setOverridePattern] = useState('');
  const [overrideCorrection, setOverrideCorrection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Compute the CertOverrides payload from all per-tab state. Only fields that
  // diverge from the underlying canonical values are persisted — keeps the
  // jsonb column tidy and the audit trail accurate.
  function buildCertOverridesPayload(): CertOverrides {
    const out: CertOverrides = {};

    const insuredDiff: InsuredOverride = {};
    if (insuredEdit.name !== currentInsured.name) insuredDiff.name = insuredEdit.name;
    if (insuredEdit.address1 !== currentInsured.address1) insuredDiff.address1 = insuredEdit.address1;
    if (insuredEdit.address2 !== currentInsured.address2) insuredDiff.address2 = insuredEdit.address2;
    if (Object.keys(insuredDiff).length > 0) out.insured = insuredDiff;

    const agencyDiff: AgencyOverride = {};
    if (agencyEdit.name !== currentAgency.name) agencyDiff.name = agencyEdit.name;
    if (agencyEdit.address1 !== currentAgency.address1) agencyDiff.address1 = agencyEdit.address1;
    if (agencyEdit.address2 !== currentAgency.address2) agencyDiff.address2 = agencyEdit.address2;
    if (agencyEdit.contactName !== currentAgency.contactName) agencyDiff.contactName = agencyEdit.contactName;
    if (agencyEdit.phone !== currentAgency.phone) agencyDiff.phone = agencyEdit.phone;
    if (agencyEdit.fax !== currentAgency.fax) agencyDiff.fax = agencyEdit.fax;
    if (agencyEdit.email !== currentAgency.email) agencyDiff.email = agencyEdit.email;
    if (Object.keys(agencyDiff).length > 0) out.agency = agencyDiff;

    if (descriptionEdit.trim() !== '') out.description = descriptionEdit;
    if (revisionEdit.trim() !== '') out.revisionNumber = revisionEdit.trim();

    const coverageEntries: Record<string, CoverageOverride> = {};
    const insurerEntries: Record<string, { name?: string; naic?: string }> = {};
    for (const orig of currentCoverages) {
      const cur = coverageEdits[orig.policyId];
      if (!cur) continue;
      const covDiff: CoverageOverride = {};
      if (cur.policyNumber !== orig.policyNumber) covDiff.policyNumber = cur.policyNumber;
      if (cur.effDate !== orig.effDate) covDiff.effDate = isoToUs(cur.effDate);
      if (cur.expDate !== orig.expDate) covDiff.expDate = isoToUs(cur.expDate);
      if (cur.addlInsuredBlanket !== orig.addlInsuredBlanket) covDiff.addlInsuredBlanket = cur.addlInsuredBlanket;
      if (cur.subrogationWaived !== orig.subrogationWaived) covDiff.subrogationWaived = cur.subrogationWaived;
      if (cur.description !== orig.description) covDiff.description = cur.description;
      const limitDiff: Record<string, number> = {};
      for (const f of LIMIT_FIELDS[cur.type] ?? []) {
        const before = orig.limits[f.key];
        const after = cur.limits[f.key];
        if (after !== before && after !== undefined && !Number.isNaN(after)) {
          limitDiff[f.key] = after;
        }
      }
      if (Object.keys(limitDiff).length > 0) covDiff.limits = limitDiff;

      // Type-specific flag diffs. Always emit them — there's no canonical
      // "before" value on the EditableCoverage from the parent, so the diff
      // is "is the user-chosen value different from the type-default?".
      if (cur.type === 'GL') {
        if (cur.claimsMade) covDiff.claimsMade = true;
        if (cur.generalAggregateAppliesPer && cur.generalAggregateAppliesPer !== 'POLICY') {
          covDiff.generalAggregateAppliesPer = cur.generalAggregateAppliesPer;
        }
        if (cur.generalAggregateAppliesPer === 'OTHER' && (cur.generalAggregateOtherText ?? '').trim() !== '') {
          covDiff.generalAggregateOtherText = (cur.generalAggregateOtherText ?? '').trim();
        }
      } else if (cur.type === 'AUTO') {
        if (cur.anyAuto)            covDiff.anyAuto = true;
        if (cur.ownedAutosOnly)     covDiff.ownedAutosOnly = true;
        if (cur.scheduledAutos)     covDiff.scheduledAutos = true;
        if (cur.hiredAutosOnly)     covDiff.hiredAutosOnly = true;
        if (cur.nonOwnedAutosOnly)  covDiff.nonOwnedAutosOnly = true;
      } else if (cur.type === 'UMBRELLA') {
        if (cur.excess) covDiff.excess = true;
        if (cur.umbClaimsMade) covDiff.claimsMade = true;
        if (cur.deductibleVsRetention && cur.deductibleVsRetention !== 'RETENTION') {
          covDiff.deductibleVsRetention = cur.deductibleVsRetention;
        }
      } else if (cur.type === 'WC') {
        if (cur.officerExcluded === false) covDiff.officerExcluded = false;
        if (cur.perStatuteVsOther && cur.perStatuteVsOther !== 'PER_STATUTE') {
          covDiff.perStatuteVsOther = cur.perStatuteVsOther;
        }
        if (cur.perStatuteVsOther === 'OTHER' && (cur.perStatuteOtherText ?? '').trim() !== '') {
          covDiff.perStatuteOtherText = (cur.perStatuteOtherText ?? '').trim();
        }
      }

      if (Object.keys(covDiff).length > 0) coverageEntries[orig.policyId] = covDiff;

      // Insurer override is keyed by the ORIGINAL NAIC so applyInsurerOverrides
      // can find the right insurer record at render time.
      const insDiff: { name?: string; naic?: string } = {};
      if (cur.insurerName !== orig.insurerName) insDiff.name = cur.insurerName;
      if (cur.insurerNaic !== orig.insurerNaic) insDiff.naic = cur.insurerNaic;
      if (Object.keys(insDiff).length > 0 && orig.insurerNaic) {
        insurerEntries[orig.insurerNaic] = insDiff;
      }
    }
    if (Object.keys(coverageEntries).length > 0) out.coverages = coverageEntries;
    if (Object.keys(insurerEntries).length > 0) out.insurers = insurerEntries;

    return out;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { requestId, decision: mode };
      if (mode === 'edit') {
        body.holder = holder;
        const certOverrides = buildCertOverridesPayload();
        // Keep the persisted payload in step with what we built — also lets
        // the next reopen re-hydrate cleanly.
        setOverrides(certOverrides);
        if (Object.keys(certOverrides).length > 0) body.certOverrides = certOverrides;
      }
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
      let payload: { ok?: boolean; error?: string; detail?: string } = {};
      try {
        payload = await res.json();
      } catch {
        // Non-JSON body — keep payload empty and fall through to status-code error.
      }
      if (!res.ok || !payload.ok) {
        if (res.status === 502) {
          setError(
            (payload.detail || payload.error || 'Send failed.') +
              ' Decision saved — use the Retry button to send again.',
          );
          router.refresh();
          return;
        }
        setError(payload.detail || payload.error || `Request failed (${res.status}).`);
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

  async function handlePreview() {
    setPreviewLoading(true);
    setError(null);
    try {
      const certOverrides = buildCertOverridesPayload();
      const res = await fetch('/api/admin/preview-cert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestId,
          holder,
          certOverrides: Object.keys(certOverrides).length > 0 ? certOverrides : undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(`Preview failed: ${text || res.statusText}`);
        return;
      }
      const blob = await res.blob();
      // Revoke any previous URL — only one preview alive at a time.
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
      setShowPreview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPreviewLoading(false);
    }
  }

  function handleClosePreview() {
    setShowPreview(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }

  const cfg = MODE_CONFIG[mode];
  // Hint that bubbles to the user — shows up in the heading of the Edit panel.
  const overridesActive = Object.keys(overrides).length > 0 || Object.keys(buildCertOverridesPayload()).length > 0;

  return (
    <form onSubmit={handleSubmit}>
      {/* Real radio cards — icon + title + description per choice */}
      <div role="radiogroup" aria-label="Decision" className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <RadioCard
          name="decision"
          value="approve"
          selected={mode === 'approve'}
          onSelect={() => setMode('approve')}
          icon={<Check className="h-4 w-4" aria-hidden="true" />}
          title="Approve"
          description="Send as-is to the requester."
          tone="success"
        />
        <RadioCard
          name="decision"
          value="edit"
          selected={mode === 'edit'}
          onSelect={() => setMode('edit')}
          icon={<Edit3 className="h-4 w-4" aria-hidden="true" />}
          title="Edit"
          description="Adjust the cert before sending."
          tone="warning"
        />
        <RadioCard
          name="decision"
          value="reject"
          selected={mode === 'reject'}
          onSelect={() => setMode('reject')}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          title="Reject"
          description="Send back to the client with a reason."
          tone="danger"
        />
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
              Edits re-render the PDF on send · today's date is always stamped fresh
              {overridesActive && (
                <span className="ml-2 text-warning">· field edits active</span>
              )}
            </p>

            {/* Edit tabs */}
            <div
              role="tablist"
              aria-label="Edit section"
              className="mt-4 flex flex-wrap gap-1 border-b border-hairline-strong"
            >
              {(
                [
                  ['holder', 'Holder'],
                  ['insured', 'Insured'],
                  ['producer', 'Producer'],
                  ['coverages', 'Coverages'],
                  ['description', 'Operations'],
                ] as const
              ).map(([id, label]) => {
                const isActive = editTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setEditTab(id)}
                    className={`focus-ring -mb-px border-b-2 px-3 py-2 text-[0.78rem] font-medium transition-colors ${
                      isActive
                        ? 'border-warning text-warning'
                        : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 space-y-5">
              {editTab === 'holder' && (
                <>
                  <UnderlinedField
                    id="holder-name"
                    label="Holder name"
                    value={holder.name}
                    onChange={(v) => setHolder((h) => ({ ...h, name: v }))}
                  />
                  <UnderlinedField
                    id="holder-addr1"
                    label="Address line 1"
                    value={holder.address1}
                    onChange={(v) => setHolder((h) => ({ ...h, address1: v }))}
                  />
                  <UnderlinedField
                    id="holder-addr2"
                    label="Address line 2"
                    value={holder.address2}
                    onChange={(v) => setHolder((h) => ({ ...h, address2: v }))}
                  />
                </>
              )}

              {editTab === 'insured' && (
                <>
                  <UnderlinedField
                    id="ins-name"
                    label="Insured name"
                    value={insuredEdit.name}
                    onChange={(v) => setInsuredEdit((s) => ({ ...s, name: v }))}
                  />
                  <UnderlinedField
                    id="ins-addr1"
                    label="Address line 1"
                    value={insuredEdit.address1}
                    onChange={(v) => setInsuredEdit((s) => ({ ...s, address1: v }))}
                  />
                  <UnderlinedField
                    id="ins-addr2"
                    label="Address line 2"
                    value={insuredEdit.address2}
                    onChange={(v) => setInsuredEdit((s) => ({ ...s, address2: v }))}
                  />
                </>
              )}

              {editTab === 'producer' && (
                <>
                  <UnderlinedField
                    id="ag-name"
                    label="Producer name"
                    value={agencyEdit.name}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, name: v }))}
                  />
                  <UnderlinedField
                    id="ag-addr1"
                    label="Address line 1"
                    value={agencyEdit.address1}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, address1: v }))}
                  />
                  <UnderlinedField
                    id="ag-addr2"
                    label="Address line 2"
                    value={agencyEdit.address2}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, address2: v }))}
                  />
                  <UnderlinedField
                    id="ag-contact"
                    label="Contact name"
                    value={agencyEdit.contactName}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, contactName: v }))}
                  />
                  <UnderlinedField
                    id="ag-phone"
                    label="Phone"
                    value={agencyEdit.phone}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, phone: v }))}
                  />
                  <UnderlinedField
                    id="ag-fax"
                    label="Fax"
                    value={agencyEdit.fax}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, fax: v }))}
                  />
                  <UnderlinedField
                    id="ag-email"
                    label="Email"
                    value={agencyEdit.email}
                    onChange={(v) => setAgencyEdit((s) => ({ ...s, email: v }))}
                  />
                </>
              )}

              {editTab === 'coverages' &&
                currentCoverages.map((orig) => {
                  const cur = coverageEdits[orig.policyId];
                  if (!cur) return null;
                  return (
                    <div
                      key={orig.policyId}
                      className="border border-hairline-strong bg-card p-5"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-display text-[1rem] font-semibold text-ink">
                          {TYPE_LABEL[cur.type] ?? cur.type}
                        </span>
                        <span className="caps text-[0.6rem] font-medium text-ink-faint">
                          {cur.type}
                        </span>
                      </div>
                      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                        <UnderlinedField
                          id={`pol-${cur.policyId}-num`}
                          label="Policy number"
                          value={cur.policyNumber}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { policyNumber: v })
                          }
                        />
                        <UnderlinedField
                          id={`pol-${cur.policyId}-eff`}
                          label="Eff date (YYYY-MM-DD)"
                          value={cur.effDate}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { effDate: v })
                          }
                        />
                        <UnderlinedField
                          id={`pol-${cur.policyId}-exp`}
                          label="Exp date (YYYY-MM-DD)"
                          value={cur.expDate}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { expDate: v })
                          }
                        />
                        <UnderlinedField
                          id={`pol-${cur.policyId}-ins-name`}
                          label="Insurer name"
                          value={cur.insurerName}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { insurerName: v })
                          }
                        />
                        <UnderlinedField
                          id={`pol-${cur.policyId}-naic`}
                          label="NAIC"
                          value={cur.insurerNaic}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { insurerNaic: v })
                          }
                        />
                        <UnderlinedField
                          id={`pol-${cur.policyId}-desc`}
                          label="Per-coverage description"
                          value={cur.description}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, { description: v })
                          }
                        />
                      </div>

                      <p className="caps mt-6 text-[0.6rem] font-medium text-ink-faint">Limits</p>
                      <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-2">
                        {(LIMIT_FIELDS[cur.type] ?? []).map((f) => (
                          <UnderlinedField
                            key={f.key}
                            id={`pol-${cur.policyId}-lim-${f.key}`}
                            label={f.label}
                            value={
                              cur.limits[f.key] !== undefined ? String(cur.limits[f.key]) : ''
                            }
                            onChange={(v) => {
                              const n = v === '' ? undefined : Number(v.replace(/[^\d.-]/g, ''));
                              setCoverageEdits((m) => {
                                const next = { ...m };
                                const c = next[cur.policyId];
                                if (!c) return m;
                                const limits = { ...c.limits };
                                if (n === undefined || Number.isNaN(n)) delete limits[f.key];
                                else limits[f.key] = n;
                                next[cur.policyId] = { ...c, limits };
                                return next;
                              });
                            }}
                          />
                        ))}
                      </div>

                      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
                        <CheckboxField
                          id={`pol-${cur.policyId}-ai`}
                          label="Additional Insured (blanket)"
                          checked={cur.addlInsuredBlanket}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, {
                              addlInsuredBlanket: v,
                            })
                          }
                        />
                        <CheckboxField
                          id={`pol-${cur.policyId}-wos`}
                          label="Waiver of Subrogation"
                          checked={cur.subrogationWaived}
                          onChange={(v) =>
                            updateCoverage(setCoverageEdits, cur.policyId, {
                              subrogationWaived: v,
                            })
                          }
                        />
                      </div>

                      {/* GL-specific controls */}
                      {cur.type === 'GL' && (
                        <div className="mt-6 space-y-4 border-t border-hairline pt-5">
                          <RadioGroup
                            label="Claims-made vs Occurrence"
                            value={cur.claimsMade ? 'CLAIMS' : 'OCCUR'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                claimsMade: v === 'CLAIMS',
                              })
                            }
                            options={[
                              { value: 'OCCUR', label: 'Occurrence' },
                              { value: 'CLAIMS', label: 'Claims-made' },
                            ]}
                          />
                          <RadioGroup
                            label="Gen'l Aggregate Limit Applies Per"
                            value={cur.generalAggregateAppliesPer ?? 'POLICY'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                generalAggregateAppliesPer: v as 'POLICY' | 'PROJECT' | 'LOC' | 'OTHER',
                              })
                            }
                            options={[
                              { value: 'POLICY', label: 'Policy' },
                              { value: 'PROJECT', label: 'Project' },
                              { value: 'LOC', label: 'Loc' },
                              { value: 'OTHER', label: 'Other' },
                            ]}
                          />
                          {cur.generalAggregateAppliesPer === 'OTHER' && (
                            <UnderlinedField
                              id={`pol-${cur.policyId}-aggother`}
                              label="Other (free-text shown next to checkbox)"
                              value={cur.generalAggregateOtherText ?? ''}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, {
                                  generalAggregateOtherText: v,
                                })
                              }
                            />
                          )}
                        </div>
                      )}

                      {/* Auto-specific type checkboxes */}
                      {cur.type === 'AUTO' && (
                        <div className="mt-6 border-t border-hairline pt-5">
                          <p className="caps mb-3 text-[0.6rem] font-medium text-ink-faint">
                            Auto type (check all that apply)
                          </p>
                          <div className="flex flex-wrap gap-x-6 gap-y-3">
                            <CheckboxField
                              id={`pol-${cur.policyId}-anyauto`}
                              label="Any Auto"
                              checked={cur.anyAuto ?? false}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, { anyAuto: v })
                              }
                            />
                            <CheckboxField
                              id={`pol-${cur.policyId}-owned`}
                              label="Owned Autos Only"
                              checked={cur.ownedAutosOnly ?? false}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, { ownedAutosOnly: v })
                              }
                            />
                            <CheckboxField
                              id={`pol-${cur.policyId}-sched`}
                              label="Scheduled Autos"
                              checked={cur.scheduledAutos ?? false}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, { scheduledAutos: v })
                              }
                            />
                            <CheckboxField
                              id={`pol-${cur.policyId}-hired`}
                              label="Hired Autos Only"
                              checked={cur.hiredAutosOnly ?? false}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, { hiredAutosOnly: v })
                              }
                            />
                            <CheckboxField
                              id={`pol-${cur.policyId}-nonown`}
                              label="Non-Owned Autos Only"
                              checked={cur.nonOwnedAutosOnly ?? false}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, { nonOwnedAutosOnly: v })
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Umbrella-specific controls */}
                      {cur.type === 'UMBRELLA' && (
                        <div className="mt-6 space-y-4 border-t border-hairline pt-5">
                          <RadioGroup
                            label="Coverage form"
                            value={cur.excess ? 'EXCESS' : 'UMBRELLA'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                excess: v === 'EXCESS',
                              })
                            }
                            options={[
                              { value: 'UMBRELLA', label: 'Umbrella Liab' },
                              { value: 'EXCESS', label: 'Excess Liab' },
                            ]}
                          />
                          <RadioGroup
                            label="Occur vs Claims-made"
                            value={cur.umbClaimsMade ? 'CLAIMS' : 'OCCUR'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                umbClaimsMade: v === 'CLAIMS',
                              })
                            }
                            options={[
                              { value: 'OCCUR', label: 'Occurrence' },
                              { value: 'CLAIMS', label: 'Claims-made' },
                            ]}
                          />
                          <RadioGroup
                            label="Deductible vs Retention (which side gets the X)"
                            value={cur.deductibleVsRetention ?? 'RETENTION'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                deductibleVsRetention: v as 'DED' | 'RETENTION',
                              })
                            }
                            options={[
                              { value: 'DED', label: 'Ded' },
                              { value: 'RETENTION', label: 'Retention' },
                            ]}
                          />
                        </div>
                      )}

                      {/* WC-specific controls */}
                      {cur.type === 'WC' && (
                        <div className="mt-6 space-y-4 border-t border-hairline pt-5">
                          <RadioGroup
                            label="Per Statute vs Other"
                            value={cur.perStatuteVsOther ?? 'PER_STATUTE'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                perStatuteVsOther: v as 'PER_STATUTE' | 'OTHER',
                              })
                            }
                            options={[
                              { value: 'PER_STATUTE', label: 'Per Statute' },
                              { value: 'OTHER', label: 'Other' },
                            ]}
                          />
                          {cur.perStatuteVsOther === 'OTHER' && (
                            <UnderlinedField
                              id={`pol-${cur.policyId}-othertext`}
                              label="Other (free-text shown under OTH- checkbox)"
                              value={cur.perStatuteOtherText ?? ''}
                              onChange={(v) =>
                                updateCoverage(setCoverageEdits, cur.policyId, {
                                  perStatuteOtherText: v,
                                })
                              }
                            />
                          )}
                          <RadioGroup
                            label="Any Proprietor / Partner / Officer / Member Excluded?"
                            value={cur.officerExcluded === false ? 'N' : 'Y'}
                            onChange={(v) =>
                              updateCoverage(setCoverageEdits, cur.policyId, {
                                officerExcluded: v === 'Y',
                              })
                            }
                            options={[
                              { value: 'Y', label: 'Y (excluded)' },
                              { value: 'N', label: 'N (not excluded)' },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

              {editTab === 'description' && (
                <div className="space-y-5">
                  <UnderlinedField
                    id="rev-number"
                    label="Revision number (leave blank for original issuance)"
                    value={revisionEdit}
                    onChange={setRevisionEdit}
                    placeholder="e.g. 1"
                  />
                  <div>
                    <label
                      htmlFor="desc-ops"
                      className="caps block text-[0.62rem] font-semibold text-ink-muted"
                    >
                      Description of Operations / Locations / Vehicles
                    </label>
                    <textarea
                      id="desc-ops"
                      rows={6}
                      value={descriptionEdit}
                      onChange={(e) => setDescriptionEdit(e.target.value)}
                      placeholder="e.g. ACME Corp is named as Additional Insured per blanket endorsement..."
                      className="field-underline mt-2 block w-full resize-none text-base text-ink"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={handlePreview}
                disabled={previewLoading}
                className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-4 py-2 text-[0.78rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {previewLoading ? 'Rendering…' : 'Preview PDF'}
              </button>
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

      <ActionBar
        className="mt-12"
        context={
          mode === 'edit'
            ? overridesActive
              ? 'Field edits are queued. PDF will re-render on send.'
              : 'No edits yet. Use the tabs above to change holder, insured, producer, coverages, or operations.'
            : mode === 'reject'
              ? 'The reason you wrote will be emailed to the client.'
              : 'PDF will be re-rendered with today’s date and emailed on send.'
        }
      >
        <Button
          type="submit"
          variant={mode === 'reject' ? 'danger' : 'primary'}
          size="lg"
          loading={submitting}
          className="sm:ml-auto"
        >
          {submitting ? 'Working…' : cfg.submitLabel}
        </Button>
      </ActionBar>

      {showPreview && previewUrl && (
        <PdfPreviewModal url={previewUrl} onClose={handleClosePreview} />
      )}
    </form>
  );
}

function usToIso(us: string): string {
  // Expect MM/DD/YYYY → YYYY-MM-DD. If input doesn't match, return as-is so
  // the caller can detect and recover.
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(us);
  if (!m) return us;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function filterNumbers(o: Record<string, number | undefined> | undefined): Record<string, number> {
  if (!o) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'number' && !Number.isNaN(v)) out[k] = v;
  }
  return out;
}

function updateCoverage(
  setter: React.Dispatch<React.SetStateAction<Record<string, EditableCoverage>>>,
  policyId: string,
  patch: Partial<EditableCoverage>,
): void {
  setter((m) => {
    const next = { ...m };
    const cur = next[policyId];
    if (!cur) return m;
    next[policyId] = { ...cur, ...patch };
    return next;
  });
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

function CheckboxField({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-[0.85rem] text-ink">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 rounded-[3px] border-hairline-strong text-brand focus:ring-brand/40"
      />
      <span>{label}</span>
    </label>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <div>
      <p className="caps block text-[0.62rem] font-semibold text-ink-muted">{label}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 text-[0.85rem] text-ink"
          >
            <input
              type="radio"
              name={label}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="h-4 w-4 shrink-0 border-hairline-strong text-brand focus:ring-brand/40"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
