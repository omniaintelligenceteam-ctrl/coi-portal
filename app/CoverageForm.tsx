'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { SectionLabel } from './components/SectionLabel';
import { MonoTag } from './components/MonoTag';

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

  // On mount: check for re-issue prefill first, then autosaved draft
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
        };
        if (d.holderName || d.holderAddress1) {
          setHolderName(d.holderName ?? '');
          setHolderAddress1(d.holderAddress1 ?? '');
          setHolderAddress2(d.holderAddress2 ?? '');
          if (d.selectedIds) setSelected(new Set(d.selectedIds));
          setShowDraftBanner(true);
        }
      } catch {}
    }
  }, [clientId]);

  // Debounced autosave to localStorage
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
        }),
      );
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [holderName, holderAddress1, holderAddress2, selected, clientId, state.kind]);

  // Holder suggestions: filter saved holders by current name input
  const filteredSuggestions =
    suggestOpen && holderName.trim().length > 0
      ? savedHolders
          .filter((h) => h.name.toLowerCase().includes(holderName.toLowerCase().trim()))
          .slice(0, 6)
      : savedHolders.slice(0, 6); // show all when field is empty but focused

  function applyHolder(h: SavedHolder) {
    setHolderName(h.name);
    setHolderAddress1(h.address1);
    setHolderAddress2(h.address2);
    setSuggestOpen(false);
    setShowPrefillBanner(false);
    setShowDraftBanner(false);
  }

  function togglePolicy(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (selected.size === 0) {
      setState({ kind: 'error', message: 'Select at least one coverage to include.' });
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
            name: holderName.trim(),
            address1: holderAddress1.trim(),
            address2: holderAddress2.trim(),
          },
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setState({ kind: 'error', message: text || `Request failed (${res.status}).` });
        return;
      }
      const json = (await res.json()) as { certNumber?: string };
      localStorage.removeItem(draftKey(clientId));
      setState({ kind: 'success', certNumber: json.certNumber ?? 'pending' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'Network error.' });
    }
  }

  if (state.kind === 'success') {
    return <SuccessState certNumber={state.certNumber} />;
  }

  const showSuggest = suggestOpen && filteredSuggestions.length > 0;

  const quickHolders = savedHolders.slice(0, 3);

  return (
    <form onSubmit={handleSubmit} className="space-y-10 pb-28 sm:space-y-14 sm:pb-0">
      {mode === 'admin' && (
        <div className="border border-brand/30 bg-brand-soft/40 px-4 py-3">
          <p className="caps text-[0.6rem] font-semibold text-brand-deep">Agent mode</p>
          <p className="mt-1 text-sm text-ink">
            Generating on behalf of{' '}
            <span className="font-semibold">{onBehalfOf ?? 'this client'}</span>. This cert will be
            audit-trailed to your email.
          </p>
        </div>
      )}

      {/* Restore banners */}
      <AnimatePresence>
        {(showPrefillBanner || showDraftBanner) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex items-center justify-between gap-4 border border-seal/30 bg-seal-soft px-4 py-3"
          >
            <p className="text-sm text-seal-deep">
              {showPrefillBanner
                ? 'Holder details pre-filled from a previous certificate.'
                : 'Draft restored from your last session.'}
            </p>
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
                  localStorage.removeItem(draftKey(clientId));
                }
              }}
              className="caps shrink-0 text-[0.6rem] font-semibold text-seal-deep underline-offset-2 hover:underline"
            >
              {showPrefillBanner ? 'Dismiss' : 'Clear draft'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 01 · Coverages */}
      <section>
        <SectionLabel number={1}>Select coverages</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          All in-force policies are included by default. Uncheck any you'd like to leave off this
          certificate.
        </p>

        <ul className="mt-6 divide-y divide-hairline border-y border-hairline">
          {policies.map((p) => (
            <CoverageRow
              key={p.id}
              policy={p}
              isSelected={selected.has(p.id)}
              onToggle={() => togglePolicy(p.id)}
            />
          ))}
        </ul>
        <p className="caps mt-3 text-[0.6rem] font-medium text-ink-faint">
          {selected.size} of {policies.length} selected
        </p>
      </section>

      {/* 02 · Holder */}
      <section>
        <SectionLabel number={2}>Certificate Holder</SectionLabel>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The company or person this certificate is issued to — the name your contract requires it
          to be made out to.
        </p>

        {/* Quick-pick lane: recent holders for one-tap fill on mobile */}
        {quickHolders.length > 0 && (
          <div className="mt-5">
            <p className="caps mb-2 text-[0.6rem] font-medium text-ink-faint">Recent holders</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {quickHolders.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyHolder(h)}
                  className="focus-ring tap-target group inline-flex w-full items-center gap-2 rounded-full border border-hairline-strong bg-white px-4 py-3 text-left text-sm text-ink transition-colors hover:border-brand hover:bg-brand-soft/50 sm:w-auto sm:max-w-[15rem] sm:px-3 sm:py-2 sm:text-[0.78rem]"
                  aria-label={`Use ${h.name}`}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-seal" aria-hidden="true" />
                  <span className="truncate font-medium">{h.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 space-y-6">
          {/* Holder name with saved-holder suggest dropdown */}
          <div className="relative">
            <UnderlinedField
              id="holder-name"
              label="Holder name"
              required
              value={holderName}
              onChange={setHolderName}
              placeholder="Name on the contract"
              autoComplete="organization"
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
                  className="absolute left-0 right-0 top-full z-20 mt-1 border border-hairline-strong bg-white shadow-lg"
                  role="listbox"
                  aria-label="Saved holders"
                >
                  {filteredSuggestions.map((h, i) => (
                    <li key={i} role="option" aria-selected={false}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyHolder(h)}
                        className="focus-ring block w-full px-4 py-3 text-left transition-colors hover:bg-paper-deep/50"
                      >
                        <span className="block text-sm font-medium text-ink">{h.name}</span>
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
      </section>

      {state.kind === 'error' && (
        <p className="border-l-2 border-danger pl-4 text-sm leading-relaxed text-danger">
          {state.message}
        </p>
      )}

      {/* Submit — sticky on mobile, inline on sm+ */}
      <section
        className="sticky bottom-0 -mx-6 bg-paper/95 px-6 pb-safe pt-3 backdrop-blur-md sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-2 sm:backdrop-blur-none"
        style={{ boxShadow: 'var(--shadow-sticky)' }}
      >
        {/* Trust microcopy sits above the button on mobile so the button is the last thing under the thumb */}
        <p className="caps mb-3 flex items-center gap-1.5 text-[0.6rem] font-medium text-ink-faint sm:order-2 sm:mb-0 sm:mt-4">
          <ShieldGlyph className="h-3 w-3 text-seal" />
          Reviewed by a licensed agent before issue
        </p>
        <button
          type="submit"
          disabled={state.kind === 'submitting'}
          aria-busy={state.kind === 'submitting'}
          aria-disabled={state.kind === 'submitting'}
          className="focus-ring group inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-6 py-4 text-[0.95rem] font-semibold text-white shadow-sm transition-all hover:bg-brand-deep active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 sm:order-1 sm:w-auto sm:min-w-[280px] sm:text-sm"
        >
          {state.kind === 'submitting' ? (
            <>
              <PulseDots />
              <span>Submitting for review…</span>
            </>
          ) : (
            <>
              <span>Submit for Brook's review</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </section>
    </form>
  );
}

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
        className={`group relative flex cursor-pointer items-start gap-4 py-5 pl-3 pr-2 transition-colors sm:gap-5 sm:pl-4 ${
          isSelected ? 'bg-paper-deep/50' : 'hover:bg-paper-deep/30'
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute left-0 top-5 h-[calc(100%-2.5rem)] w-[2px] transition-colors ${
            isSelected ? 'bg-brand' : 'bg-transparent'
          }`}
        />

        {/* 44×44 tap target wrapping the visible 22×22 checkbox */}
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
                : 'border-hairline-strong bg-white group-hover:border-ink-muted'
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
          {/* Row 1 — coverage name + type chip */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="font-display text-[1.05rem] font-semibold tracking-tight text-ink">
              {TYPE_LABEL[policy.type]}
            </span>
            <span className="caps inline-flex items-center rounded-[3px] bg-paper-deep px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink-muted">
              {policy.type}
            </span>
          </div>

          {/* Row 2 — insurer (own line on mobile) */}
          <p className="mt-2 text-[0.82rem] text-ink-muted">{policy.insurerName}</p>

          {/* Row 3 — policy # + date range (own line, never bullet-wraps weird) */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.74rem]">
            <MonoTag size="sm" tone="subtle">
              {policy.policyNumber}
            </MonoTag>
            <span className="font-mono text-ink-muted">
              {formatDate(policy.effDate)} <span className="text-ink-faint">→</span>{' '}
              {formatDate(policy.expDate)}
            </span>
          </div>

          {/* Row 4 — endorsement chips on their own line */}
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
                <span className="rounded-[3px] border border-hairline-strong bg-white px-2 py-0.5 text-[0.7rem] text-ink-muted">
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
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="caps flex items-baseline gap-1 text-[0.62rem] font-semibold text-ink-muted"
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
        autoComplete={autoComplete ?? 'off'}
        className="field-underline mt-1 block w-full text-ink"
      />
    </div>
  );
}

function SuccessState({ certNumber }: { certNumber: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative overflow-hidden border border-hairline bg-card px-8 py-14 sm:px-14 sm:py-16">
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
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Submitted for review</p>
        <h2 className="font-display mt-4 text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3rem]">
          Request received.
        </h2>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: -12, rotate: -1.5 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          className="mt-8"
        >
          <p className="caps text-[0.6rem] font-medium text-ink-faint">Reference</p>
          <p className="mt-2 font-mono text-[1.6rem] font-medium tabular-nums text-ink">
            {certNumber}
          </p>
        </motion.div>

        <p className="mt-8 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
          Brook will review this request and email the finished certificate, signed and dated,
          usually within a few business hours.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href={`/result/${certNumber}`}
            className="focus-ring inline-flex items-center gap-2 rounded-md bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep"
          >
            Track this certificate →
          </a>
          <a
            href="/certificates"
            className="focus-ring inline-flex items-center gap-2 rounded-md border border-hairline-strong bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-paper-deep/40"
          >
            All certificates
          </a>
        </div>
      </div>
    </div>
  );
}

function PulseDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-white"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

function ShieldGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2l8 3v6c0 5-3.5 9.3-8 11-4.5-1.7-8-6-8-11V5l8-3z" />
    </svg>
  );
}
