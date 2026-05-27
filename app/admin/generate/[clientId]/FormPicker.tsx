'use client';

import { useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { CoverageForm, type PolicyForForm, type SavedHolder } from '@/app/CoverageForm';
import { Banner, Button, Card, EmptyState, RadioCard, Section } from '@/app/components/ui';

/**
 * Wraps the request-flow form components and gates them behind a per-client
 * form picker. Two paths:
 *
 *   - Single enabled form → skips the picker and renders the form's request
 *     component directly. This is the dominant path today (only ACORD_25 is
 *     registered, so almost every client has exactly one enabled form).
 *   - 2+ enabled forms → renders a RadioCard picker. After the admin/insured
 *     picks one, the form-specific component mounts with formId threaded in.
 *
 * Form ID → component mapping lives in this file (not in the registry) because
 * each form's request UI is bespoke — ACORD 25 collects holder + coverages,
 * ACORD 27 would collect different fields, etc. When ACORD 27 ships its own
 * <Acord27Form />, add a case to the switch below.
 */

export type EnabledFormSummary = {
  id: string;
  displayName: string;
  revision: string;
};

export function FormPicker({
  clientId,
  policies,
  savedHolders = [],
  mode = 'self',
  onBehalfOf,
  enabledForms,
}: {
  clientId: string;
  policies: PolicyForForm[];
  savedHolders?: SavedHolder[];
  mode?: 'self' | 'admin';
  onBehalfOf?: string;
  enabledForms: EnabledFormSummary[];
}) {
  // Skip the picker entirely when only one form is enabled — pre-select it so
  // the user lands directly in the form's request flow.
  const onlyOne = enabledForms.length === 1 ? enabledForms[0]!.id : null;
  const [selectedFormId, setSelectedFormId] = useState<string | null>(onlyOne);
  // Holds the radio selection in the picker step (before user clicks Continue).
  const [pending, setPending] = useState<string | null>(onlyOne);

  if (enabledForms.length === 0) {
    return (
      <EmptyState
        tone="seal"
        icon={<FileText className="h-6 w-6" aria-hidden="true" />}
        eyebrow="No forms enabled"
        title="No forms enabled for this client."
        description="Admin: open the client's Forms tab and enable at least one form before requesting a certificate."
      />
    );
  }

  // Picker step — user hasn't committed yet.
  if (!selectedFormId) {
    return (
      <Section
        eyebrow="Step 0"
        title="Pick a form"
        description={`This client is enabled for ${enabledForms.length} forms. Choose which one to fill out.`}
        bare
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {enabledForms.map((form) => (
            <RadioCard
              key={form.id}
              name="form-picker"
              value={form.id}
              selected={pending === form.id}
              onSelect={() => setPending(form.id)}
              icon={<FileText className="h-4 w-4" aria-hidden="true" />}
              title={form.displayName}
              description={`${form.id.replace('_', ' ')} · ${form.revision}`}
            />
          ))}
        </div>
        <div className="mt-8 flex justify-end">
          <Button
            type="button"
            size="lg"
            disabled={!pending}
            onClick={() => setSelectedFormId(pending)}
            trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden="true" />}
          >
            Continue
          </Button>
        </div>
      </Section>
    );
  }

  return (
    <SelectedForm
      formId={selectedFormId}
      clientId={clientId}
      policies={policies}
      savedHolders={savedHolders}
      mode={mode}
      onBehalfOf={onBehalfOf}
      onChangeForm={enabledForms.length > 1 ? () => setSelectedFormId(null) : undefined}
    />
  );
}

/**
 * Dispatch from formId → request-flow component. ACORD 25 routes to the
 * existing CoverageForm. Future forms (ACORD 27, etc.) get their own cases.
 */
function SelectedForm({
  formId,
  clientId,
  policies,
  savedHolders,
  mode,
  onBehalfOf,
  onChangeForm,
}: {
  formId: string;
  clientId: string;
  policies: PolicyForForm[];
  savedHolders: SavedHolder[];
  mode: 'self' | 'admin';
  onBehalfOf?: string;
  onChangeForm?: () => void;
}) {
  if (formId === 'ACORD_25') {
    return (
      <div>
        {onChangeForm && <ChangeFormBar onChangeForm={onChangeForm} formLabel="ACORD 25 · Certificate of Liability" />}
        <CoverageForm
          formId={formId}
          clientId={clientId}
          policies={policies}
          savedHolders={savedHolders}
          mode={mode}
          onBehalfOf={onBehalfOf}
        />
      </div>
    );
  }

  // Form is registered but no request-flow UI is wired up yet (Phase 2 work).
  return (
    <div>
      {onChangeForm && <ChangeFormBar onChangeForm={onChangeForm} formLabel={formId.replace('_', ' ')} />}
      <Card padding="md" tone="warning">
        <Banner tone="warning" title={`${formId.replace('_', ' ')} — request flow not built yet`}>
          This form is registered in the library but its request UI isn't shipped. Engineering
          owns the next step. Pick a different form above, or contact Brook.
        </Banner>
      </Card>
    </div>
  );
}

function ChangeFormBar({
  onChangeForm,
  formLabel,
}: {
  onChangeForm: () => void;
  formLabel: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-md)] border border-hairline bg-paper-deep/40 px-4 py-3">
      <p className="caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted">
        Form · <span className="text-ink">{formLabel}</span>
      </p>
      <button
        type="button"
        onClick={onChangeForm}
        className="focus-ring caps -m-1 rounded p-1 text-[0.62rem] font-semibold tracking-[0.18em] text-brand hover:text-brand-deep"
      >
        Change form
      </button>
    </div>
  );
}
