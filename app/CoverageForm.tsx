'use client';

/**
 * CoverageForm — Statement Phase 3 multi-step rebuild.
 *
 * Three steps, one decision per screen:
 *   1. Holder      — "Who's this for?" — name + address with autocomplete
 *                    from saved holders and recent-holder chips
 *   2. Coverages   — Which on-file policies appear on this cert
 *   3. Review      — Summary of holder + coverages, then submit for review
 *
 * All prior behavior preserved verbatim:
 *   - localStorage draft autosave (PREFILL_KEY + per-client draft key)
 *   - Holder autocomplete dropdown on the name field
 *   - Recent-holders quick-pick chips
 *   - Submit endpoint (self vs admin mode)
 *   - Friendly submit-error messages
 *   - SuccessState (issued-stamp visual, cert number, action links)
 *
 * Step progression is gated: Continue button stays disabled until the
 * current step's required fields are satisfied. Back is always available.
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { MonoTag } from './components/MonoTag';
import { ActionBar, Banner, Button, ButtonLink, Card } from './components/ui';

export type PolicyForForm = {
  id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policyNumber: string;
  effDate: string;
  expDate: string;
  insurerName: string;
  addlInsuredBlanket: boolean;
  subrogationWaived: boolean;
  description: string;
};

export type SavedHolder = {
  name: string;
  address1: string;
  address2: string;
};

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; certNumber: string }
  | { kind: 'error'; message: string };

type StepNum = 1 | 2 | 3;

const TYPE_LABEL: Record<PolicyForForm['type'], string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

const PREFILL_KEY = 'coi-holder-prefill';
const draftKey = (clientId: string) => `coi-draft-${clientId}`;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function friendlySubmitError(raw: string, status: number): string {
  const msg = raw.trim();
  const lower = msg.toLowerCase();

  if (status === 401 || lower.includes('unauthorized')) {
    return 'Your session expired. Sign in again and submit once more.';
  }
  if (status === 403 || lower.includes('no client account')) {
    return 'This email is not linked to a client portal account yet. Request access first.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many certificate requests were submitted recently. Please wait a bit and try again.';
  }
  if (lower.includes('not eligible') || lower.includes('expired') || lower.includes('inactive')) {
    return 'Some selected coverages are no longer eligible. Refresh and submit again.';
  }
  if (lower.includes('holder name is required') || lower.includes('holder address is required')) {
    return 'Enter the certificate holder name and address before submitting.';
  }
  if (msg.startsWith('{') && msg.endsWith('}')) {
    return `Request failed (${status}). Please try again.`;
  }
  return msg || `Request failed (${status}). Please try again.`;
}

export function CoverageForm({
  clientId,
  policies,
  savedHolders = [],
  mode = 'self',
  onBehalfOf,
}: {
  clientId: string;
  policies: PolicyForForm[];
  savedHolders?: SavedHolder[];
  mode?: 'self' | 'admin';
  onBehalfOf?: string;
}) {
  const reduce = useReducedMotion();

  /* ---------- state (preserved from prior version) ---------- */
  const [selected, setSelected] = useState<Set<string>>(
    new Set(policies.map((p) => p.id)),
  );
  const [holderName, setHolderName] = useState('');
  const [holderAddress1, setHolderAddress1] = useState('');
  const [holderAddress2, setHolderAddress2] = useState('');
  const [state, setState] = useState<SubmitState>({ kind: 'idle' });
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [showPrefillBanner, setShowPrefillBanner] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- step machine ---------- */
  const [step, setStep] = useState<StepNum>(1);

  /* ---------- prefill / draft restore on mount ---------- */
  useEffect(() => {
    const prefill = localStorage.getItem(PREFILL_KEY);
    if (prefill) {
      try {
        const h = JSON.parse(prefill) as SavedHolder;
        setHolderName(h.name);
        setHolderAddress1(h.address1);
        setHolderAddress2(h.address2);
        setShowPrefillBanner(true);
      } catch {}
      localStorage.removeItem(PREFILL_KEY);
      return;
    }

    const draft = localStorage.getItem(draftKey(clientId));
    if (draft) {
      try {
        const d = JSON.parse(draft) as {
          holderName?: string;
          holderAddress1?: string;
          holderAddress2?: string;
          selectedIds?: string[];
          step?: StepNum;
        };
        if (d.holderName || d.holderAddress1) {
          setHolderName(d.holderName ?? '');
          setHolderAddress1(d.holderAddress1 ?? '');
          setHolderAddress2(d.holderAddress2 ?? '');
          if (d.selectedIds) setSelected(new Set(d.selectedIds));
          if (d.step === 2 || d.step === 3) setStep(d.step);
          setShowDraftBanner(true);
        }
      } catch {}
    }
  }, [clientId]);

  /* ---------- debounced draft save ---------- */
  useEffect(() => {
    if (state.kind === 'success') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(
        draftKey(clientId),
        JSON.stringify({
          holderName,
          holderAddress1,
          holderAddress2,
          selectedIds: Array.from(selected),
          step,
        }),
      );
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [holderName, holderAddress1, holderAddress2, selected, step, clientId, state.kind]);

  /* ---------- holder autocomplete ---------- */
  const filteredSuggestions =
    suggestOpen && holderName.trim().length > 0
      ? savedHolders
          .filter((h) => h.name.toLowerCase().includes(holderName.toLowerCase().trim()))
          .slice(0, 6)
      : savedHolders.slice(0, 6);

  const applyHolder = useCallback((h: SavedHolder) => {
    setHolderName(h.name);
    setHolderAddress1(h.address1);
    setHolderAddress2(h.address2);
    setSuggestOpen(false);
    setShowPrefillBanner(false);
    setShowDraftBanner(false);
  }, []);

  const togglePolicy = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ---------- step navigation ---------- */
  const holderReady = holderName.trim().length > 0 && holderAddress1.trim().length > 0;
  const coveragesReady = selected.size > 0;

  function advance() {
    setState({ kind: 'idle' }); // clear stale errors
    if (step === 1 && holderReady) setStep(2);
    else if (step === 2 && coveragesReady) setStep(3);
  }

  function back() {
    setState({ kind: 'idle' });
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }

  /* ---------- submit ---------- */
  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.size === 0) {
      setState({ kind: 'error', message: 'Select at least one coverage to include.' });
      setStep(2);
      return;
    }

    const trimmedName = holderName.trim();
    const trimmedAddress1 = holderAddress1.trim();
    const trimmedAddress2 = holderAddress2.trim();
    if (!trimmedName || !trimmedAddress1) {
      setState({
        kind: 'error',
        message: 'Enter the certificate holder name and street address before submitting.',
      });
      setStep(1);
      return;
    }

    setState({ kind: 'submitting' });
    try {
      const endpoint = mode === 'admin' ? '/api/admin/generate-coi' : '/api/generate-coi';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          selectedPolicyIds: Array.from(selected),
          holder: {
            name: trimmedName,
            address1: trimmedAddress1,
            address2: trimmedAddress2,
          },
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
        };
        const raw = payload.detail ?? payload.error ?? '';
        setState({ kind: 'error', message: friendlySubmitError(raw, res.status) });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { certNumber?: string };
      const certNumber = (json.certNumber ?? '').trim();
      if (!certNumber || certNumber.toLowerCase() === 'pending') {
        setState({
          kind: 'error',
          message:
            "We didn't get a certificate number back. Your draft is safe — try submitting again in a moment.",
        });
        return;
      }
      localStorage.removeItem(draftKey(clientId));
      setState({ kind: 'success', certNumber });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error.' });
    }
  }

  if (state.kind === 'success') {
    return <SuccessState certNumber={state.certNumber} />;
  }

  const submitting = state.kind === 'submitting';
  const submitDisabled = submitting;
  const showSuggest = suggestOpen && filteredSuggestions.length > 0;
  const quickHolders = savedHolders.slice(0, 4);

  /* ---------- per-step labels for the progress indicator ---------- */
  const stepLabels: { step: StepNum; label: string }[] = [
    { step: 1, label: 'Holder' },
    { step: 2, label: 'Coverages' },
    { step: 3, label: 'Review' },
  ];

  return (
    <form onSubmit={handleSubmit} className="pb-32 sm:pb-0">
      {/* Banners */}
      {mode === 'admin' && (
        <Banner tone="info" title="Agent mode" className="mb-6">
          Generating on behalf of{' '}
          <span className="font-semibold text-ink">{onBehalfOf ?? 'this client'}</span>. This cert
          will be audit-trailed to your email.
        </Banner>
      )}

      <AnimatePresence>
        {(showPrefillBanner || showDraftBanner) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mb-6"
          >
            <Banner
              tone="info"
              title={
                showPrefillBanner
                  ? 'Holder details pre-filled from a previous certificate'
                  : 'Draft restored from your last session'
              }
              actions={
                <button
                  type="button"
                  onClick={() => {
                    if (showPrefillBanner) setShowPrefillBanner(false);
                    else {
                      setShowDraftBanner(false);
                      setHolderName('');
                      setHolderAddress1('');
                      setHolderAddress2('');
                      setSelected(new Set(policies.map((p) => p.id)));
                      setStep(1);
                      localStorage.removeItem(draftKey(clientId));
                    }
                  }}
                  className="caps focus-ring shrink-0 rounded text-[0.62rem] font-semibold text-brand underline-offset-2 hover:underline"
                >
                  {showPrefillBanner ? 'Dismiss' : 'Clear draft'}
                </button>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Step indicator */}
      <div className="mb-6 flex items-center gap-3" aria-label={`Step ${step} of 3`}>
        {stepLabels.map((s, i) => {
          const isDone = s.step < step;
          const isActive = s.step === step;
          return (
            <div key={s.step} className="flex flex-1 items-center gap-3">
              <div className="flex flex-1 items-center gap-2.5">
                <span
                  className={[
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[0.65rem] font-semibold transition-colors',
                    isDone
                      ? 'border-brand bg-brand text-white'
                      : isActive
                        ? 'border-brand text-brand'
                        : 'border-hairline-strong text-ink-mute',
                  ].join(' ')}
                >
                  {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : s.step}
                </span>
                <span
                  className={[
                    'caps text-[0.62rem] font-semibold tracking-caps transition-colors',
                    isDone || isActive ? 'text-ink' : 'text-ink-mute',
                  ].join(' ')}
                >
                  {s.label}
                </span>
              </div>
              {i < stepLabels.length - 1 && (
                <span
                  aria-hidden="true"
                  className={[
                    'h-px flex-1 transition-colors',
                    isDone ? 'bg-brand' : 'bg-hairline',
                  ].join(' ')}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -12 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
        >
          {step === 1 && (
            <StepHolder
              holderName={holderName}
              holderAddress1={holderAddress1}
              holderAddress2={holderAddress2}
              setHolderName={setHolderName}
              setHolderAddress1={setHolderAddress1}
              setHolderAddress2={setHolderAddress2}
              quickHolders={quickHolders}
              filteredSuggestions={filteredSuggestions}
              applyHolder={applyHolder}
              suggestOpen={suggestOpen}
              setSuggestOpen={setSuggestOpen}
              showSuggest={showSuggest}
            />
          )}
          {step === 2 && (
            <StepCoverages
              policies={policies}
              selected={selected}
              togglePolicy={togglePolicy}
            />
          )}
          {step === 3 && (
            <StepReview
              holderName={holderName}
              holderAddress1={holderAddress1}
              holderAddress2={holderAddress2}
              policies={policies.filter((p) => selected.has(p.id))}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {state.kind === 'error' && (
        <div className="mt-6">
          <Banner tone="danger" title="Couldn't submit">
            {state.message}
          </Banner>
        </div>
      )}

      {/* Desktop nav */}
      <div className="mt-8 hidden items-center justify-between gap-4 border-t border-hairline pt-6 sm:flex">
        <div>
          {step > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={back}
              leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
            >
              Back
            </Button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <p className="caps flex items-center gap-1.5 text-[0.62rem] font-medium tracking-caps text-ink-faint">
            <ShieldCheck className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
            Agent-reviewed before issue
          </p>
          {step < 3 ? (
            <Button
              type="button"
              size="lg"
              onClick={advance}
              disabled={(step === 1 && !holderReady) || (step === 2 && !coveragesReady)}
              trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={submitDisabled}
              trailingIcon={!submitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
              className="min-w-[280px]"
            >
              {submitting ? 'Submitting…' : "Submit for Brook's review"}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile sticky bar */}
      <ActionBar
        mobileOnly
        context={
          step === 3 ? (
            <span className="caps inline-flex items-center gap-1.5 text-[0.6rem] font-medium tracking-caps text-ink-faint">
              <ShieldCheck className="h-3 w-3 text-brand" aria-hidden="true" />
              Agent-reviewed · {selected.size} coverage
              {selected.size === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="caps text-[0.6rem] font-medium tracking-caps text-ink-faint">
              Step {step} of 3
            </span>
          )
        }
      >
        <div className="flex w-full items-center gap-2">
          {step > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              onClick={back}
              leadingIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              className="shrink-0"
            >
              Back
            </Button>
          )}
          {step < 3 ? (
            <Button
              type="button"
              size="lg"
              fullWidth
              onClick={advance}
              disabled={(step === 1 && !holderReady) || (step === 2 && !coveragesReady)}
              trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={submitting}
              disabled={submitDisabled}
              trailingIcon={!submitting ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
            >
              {submitting ? 'Submitting…' : "Submit for Brook's review"}
            </Button>
          )}
        </div>
      </ActionBar>
    </form>
  );
}

/* ============================================================
 * Step 1 — Who's this for?
 * ============================================================ */
function StepHolder({
  holderName,
  holderAddress1,
  holderAddress2,
  setHolderName,
  setHolderAddress1,
  setHolderAddress2,
  quickHolders,
  filteredSuggestions,
  applyHolder,
  suggestOpen,
  setSuggestOpen,
  showSuggest,
}: {
  holderName: string;
  holderAddress1: string;
  holderAddress2: string;
  setHolderName: (v: string) => void;
  setHolderAddress1: (v: string) => void;
  setHolderAddress2: (v: string) => void;
  quickHolders: SavedHolder[];
  filteredSuggestions: SavedHolder[];
  applyHolder: (h: SavedHolder) => void;
  suggestOpen: boolean;
  setSuggestOpen: (v: boolean) => void;
  showSuggest: boolean;
}) {
  return (
    <Card padding="md">
      <p className="caps text-[0.62rem] font-semibold tracking-caps text-brand">Step 1 of 3</p>
      <h2 className="font-display mt-2 text-[1.75rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2rem]">
        Who's this <span className="text-brand">for?</span>
      </h2>
      <p className="mt-3 text-[0.9375rem] leading-[1.55] text-ink-muted">
        The company or person this certificate names — usually the party your contract requires to
        be named on the COI.
      </p>

      {quickHolders.length > 0 && (
        <div className="mt-6">
          <p className="caps mb-2 text-[0.6rem] font-semibold tracking-caps text-ink-faint">
            Recent holders
          </p>
          <div className="flex flex-wrap gap-2">
            {quickHolders.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applyHolder(h)}
                className="focus-ring group inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-card px-3.5 py-2 text-[0.8125rem] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft"
                aria-label={`Use ${h.name}`}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                <span className="truncate">{h.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-7 space-y-5">
        <div className="relative">
          <UnderlinedField
            id="holder-name"
            label="Holder name"
            required
            value={holderName}
            onChange={setHolderName}
            placeholder="Name on the contract"
            autoComplete="organization"
            autoFocus
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
          />
          <AnimatePresence>
            {showSuggest && (
              <motion.ul
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-hairline-strong bg-card shadow-lift"
                role="listbox"
                aria-label="Saved holders"
              >
                {filteredSuggestions.map((h, i) => (
                  <li key={i} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyHolder(h)}
                      className="focus-ring block w-full px-4 py-3 text-left transition-colors hover:bg-paper-deep"
                    >
                      <span className="block text-[0.875rem] font-medium text-ink">{h.name}</span>
                      <span className="mt-0.5 block font-mono text-[0.72rem] text-ink-muted">
                        {h.address1}
                        {h.address2 ? `, ${h.address2}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>

        <UnderlinedField
          id="holder-addr1"
          label="Street address"
          required
          value={holderAddress1}
          onChange={setHolderAddress1}
          placeholder="123 Main Street"
          autoComplete="address-line1"
        />
        <UnderlinedField
          id="holder-addr2"
          label="City, State ZIP"
          value={holderAddress2}
          onChange={setHolderAddress2}
          placeholder="City, ST 00000"
          autoComplete="address-line2"
        />
      </div>
    </Card>
  );
}

/* ============================================================
 * Step 2 — Coverages
 * ============================================================ */
function StepCoverages({
  policies,
  selected,
  togglePolicy,
}: {
  policies: PolicyForForm[];
  selected: Set<string>;
  togglePolicy: (id: string) => void;
}) {
  return (
    <Card padding="md" className="overflow-hidden">
      <p className="caps text-[0.62rem] font-semibold tracking-caps text-brand">Step 2 of 3</p>
      <h2 className="font-display mt-2 text-[1.75rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2rem]">
        Coverages
      </h2>
      <p className="mt-3 text-[0.9375rem] leading-[1.55] text-ink-muted">
        All in-force policies are pre-selected. Uncheck any you'd like to leave off this
        certificate.
      </p>

      <ul className="mt-6 divide-y divide-hairline border-y border-hairline -mx-5 sm:-mx-6">
        {policies.map((p) => (
          <CoverageRow
            key={p.id}
            policy={p}
            isSelected={selected.has(p.id)}
            onToggle={() => togglePolicy(p.id)}
          />
        ))}
      </ul>
      <p className="caps mt-3 text-[0.6rem] font-medium tracking-caps text-ink-faint">
        {selected.size} of {policies.length} selected
      </p>
    </Card>
  );
}

/* ============================================================
 * Step 3 — Review
 * ============================================================ */
function StepReview({
  holderName,
  holderAddress1,
  holderAddress2,
  policies,
}: {
  holderName: string;
  holderAddress1: string;
  holderAddress2: string;
  policies: PolicyForForm[];
}) {
  return (
    <div className="space-y-5">
      <Card padding="md">
        <p className="caps text-[0.62rem] font-semibold tracking-caps text-brand">Step 3 of 3</p>
        <h2 className="font-display mt-2 text-[1.75rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2rem]">
          Looks <span className="text-brand">right?</span>
        </h2>
        <p className="mt-3 text-[0.9375rem] leading-[1.55] text-ink-muted">
          One last check before sending. Brook reviews every cert before it goes out.
        </p>
      </Card>

      <Card padding="md">
        <p className="caps text-[0.62rem] font-semibold tracking-caps text-ink-faint">
          Certificate holder
        </p>
        <p className="font-display mt-2 text-[1.25rem] font-medium leading-[1.2] tracking-tight text-ink">
          {holderName || '—'}
        </p>
        <p className="mt-2 font-mono text-[0.85rem] leading-[1.5] text-ink-muted">
          {holderAddress1 || '—'}
          {holderAddress2 && (
            <>
              <br />
              {holderAddress2}
            </>
          )}
        </p>
      </Card>

      <Card padding="md" className="overflow-hidden">
        <div className="flex items-baseline justify-between">
          <p className="caps text-[0.62rem] font-semibold tracking-caps text-ink-faint">
            Coverages
          </p>
          <p className="num-tabular font-mono text-[0.72rem] text-ink-faint">
            {policies.length} selected
          </p>
        </div>
        <ul className="mt-4 divide-y divide-hairline border-y border-hairline -mx-5 sm:-mx-6">
          {policies.map((p) => (
            <li key={p.id} className="px-5 py-4 sm:px-6">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-[0.95rem] font-medium text-ink">{TYPE_LABEL[p.type]}</span>
                <span className="caps rounded-[3px] bg-paper-deep px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink-muted">
                  {p.type}
                </span>
              </div>
              <p className="mt-1.5 text-[0.78rem] text-ink-muted">
                {p.insurerName} ·{' '}
                <span className="font-mono">{p.policyNumber}</span> ·{' '}
                <span className="font-mono">
                  {formatDate(p.effDate)} → {formatDate(p.expDate)}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ============================================================
 * Sub-components (preserved verbatim from the prior version)
 * ============================================================ */

function CoverageRow({
  policy,
  isSelected,
  onToggle,
}: {
  policy: PolicyForForm;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label
        className={`group relative flex cursor-pointer items-start gap-4 px-5 py-5 transition-colors sm:gap-5 sm:px-6 ${
          isSelected ? 'bg-brand-soft/40' : 'hover:bg-paper-deep/25'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0 top-5 h-[calc(100%-2.5rem)] w-[2px] transition-colors ${
            isSelected ? 'bg-brand' : 'bg-transparent'
          }`}
        />

        <span className="tap-target relative -m-2 flex shrink-0 items-center justify-center p-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            className="sr-only"
          />
          <span
            className={`flex h-[22px] w-[22px] items-center justify-center rounded-[4px] border transition-all ${
              isSelected
                ? 'border-brand bg-brand'
                : 'border-hairline-strong bg-card group-hover:border-ink-muted'
            }`}
          >
            <AnimatePresence>
              {isSelected && (
                <motion.svg
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  viewBox="0 0 24 24"
                >
                  <motion.path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12l5 5L20 6"
                  />
                </motion.svg>
              )}
            </AnimatePresence>
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
              {TYPE_LABEL[policy.type]}
            </span>
            <span className="caps inline-flex items-center rounded-[3px] bg-paper-deep px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink-muted">
              {policy.type}
            </span>
          </div>

          <p className="mt-2 text-[0.82rem] text-ink-muted">{policy.insurerName}</p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem]">
            <MonoTag size="sm" tone="subtle">
              {policy.policyNumber}
            </MonoTag>
            <span className="font-mono text-ink-muted">
              {formatDate(policy.effDate)} <span className="text-ink-faint">→</span>{' '}
              {formatDate(policy.expDate)}
            </span>
          </div>

          {(policy.addlInsuredBlanket || policy.subrogationWaived || policy.description) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {policy.addlInsuredBlanket && (
                <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                  <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                  Additional Insured · blanket
                </span>
              )}
              {policy.subrogationWaived && (
                <span className="caps inline-flex items-center gap-1 rounded-[3px] border border-seal/30 bg-seal-soft px-2 py-0.5 text-[0.6rem] font-semibold text-seal-deep">
                  <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                  Waiver of Subrogation
                </span>
              )}
              {policy.description && (
                <span className="rounded-[3px] border border-hairline-strong bg-card px-2 py-0.5 text-[0.7rem] text-ink-muted">
                  {policy.description}
                </span>
              )}
            </div>
          )}
        </div>
      </label>
    </li>
  );
}

function UnderlinedField({
  id,
  label,
  required,
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  onFocus,
  onBlur,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="caps flex items-baseline gap-1 text-[0.62rem] font-semibold tracking-caps text-ink-muted"
      >
        <span>{label}</span>
        {required && (
          <span className="text-danger" aria-label="required">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={onFocus}
        onBlur={onBlur}
        autoFocus={autoFocus}
        autoComplete={autoComplete ?? 'off'}
        className="field-underline mt-1.5 block w-full text-ink"
      />
    </div>
  );
}

function SuccessState({ certNumber }: { certNumber: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-hairline bg-card px-6 py-12 shadow-lift sm:px-12 sm:py-16">
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -8 }}
        animate={{ opacity: 0.08, scale: 1, rotate: 0 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        className="absolute -right-12 -top-12 h-64 w-64 rounded-full border-[6px] border-seal"
      />
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 0.15 }}
        transition={{ duration: 1.2, delay: 0.5 }}
        className="absolute -right-4 -top-4 caps font-display text-[0.55rem] font-semibold tracking-[0.4em] text-seal"
        style={{ writingMode: 'vertical-rl' }}
      >
        · ISSUED IN GOOD ORDER · POLICY PLACE ·
      </motion.div>

      <div className="relative">
        <p className="caps text-[0.65rem] font-semibold tracking-caps text-seal-deep">
          Submitted for review
        </p>
        <h2 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.75rem]">
          Request received.
        </h2>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: -12, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="mt-8"
        >
          <p className="caps text-[0.6rem] font-medium tracking-caps text-ink-faint">Reference</p>
          <p className="num-tabular mt-2 font-mono text-[1.5rem] font-medium text-ink sm:text-[1.75rem]">
            {certNumber}
          </p>
        </motion.div>

        <p className="mt-7 max-w-md text-[0.9375rem] leading-[1.6] text-ink-muted">
          Brook will review this request and email the finished certificate, signed and dated,
          usually within a few business hours.
        </p>

        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
          <ButtonLink
            href={`/status/${encodeURIComponent(certNumber)}`}
            trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Track this certificate
          </ButtonLink>
          <ButtonLink href={`/result/${certNumber}`} variant="secondary">
            Open page
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
