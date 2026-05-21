'use client';

/**
 * Client profile editor.
 *
 * Phase 1 of the world-class plan: every editable field on coi_clients lives
 * here, validated with zod (client-side mirrors what the API enforces), with
 * dirty tracking and sonner toasts. Sections group related fields so the form
 * scans cleanly even with twice as many fields as the prior version.
 *
 * Auto-approve stays as its own component (ClientAutoApproveToggle) because
 * its semantics (fire-and-forget radio, no save button) differ from the rest
 * of the form. We just embed it inline in the Operations section.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { z } from 'zod';
import { Hairline } from '@/app/components/Hairline';
import { Input, Button, Toggle, Banner } from '@/app/components/ui';
import { ClientAutoApproveToggle } from '@/app/admin/settings/ClientAutoApproveToggle';
import { ArchiveClientButton } from './ArchiveClientButton';

export type AgencyOption = { id: string; name: string };

export type ProfileFormInitial = {
  businessName: string;
  businessAddress1: string;
  businessAddress2: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  agencyId: string;
  active: boolean;
  autoApproveEnabled: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
};

const Schema = z.object({
  businessName: z.string().min(1, 'Business name is required.').max(200, 'Too long.'),
  businessAddress1: z.string().max(200, 'Too long.'),
  businessAddress2: z.string().max(200, 'Too long.'),
  contactName: z.string().max(200, 'Too long.'),
  contactEmail: z.string().email('Must be a valid email address.').max(320, 'Too long.'),
  phone: z.string().max(50, 'Too long.'),
  agencyId: z.string().uuid('Choose an agency.'),
  active: z.boolean(),
});

type FormShape = z.infer<typeof Schema>;

export function ProfileForm({
  clientId,
  initial,
  agencies,
}: {
  clientId: string;
  initial: ProfileFormInitial;
  agencies: AgencyOption[];
}) {
  const router = useRouter();
  const isArchived = initial.archivedAt !== null;

  const [form, setForm] = useState<FormShape>(() => ({
    businessName: initial.businessName,
    businessAddress1: initial.businessAddress1,
    businessAddress2: initial.businessAddress2,
    contactName: initial.contactName,
    contactEmail: initial.contactEmail,
    phone: initial.phone,
    agencyId: initial.agencyId,
    active: initial.active,
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof FormShape, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const dirty = useMemo(() => {
    return (
      form.businessName !== initial.businessName ||
      form.businessAddress1 !== initial.businessAddress1 ||
      form.businessAddress2 !== initial.businessAddress2 ||
      form.contactName !== initial.contactName ||
      form.contactEmail !== initial.contactEmail ||
      form.phone !== initial.phone ||
      form.agencyId !== initial.agencyId ||
      form.active !== initial.active
    );
  }, [form, initial]);

  function set<K extends keyof FormShape>(key: K, value: FormShape[K]) {
    setForm((s) => ({ ...s, [key]: value }));
    // Clear field error as the user edits.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
    setServerError(null);
  }

  async function handleSave() {
    const parsed = Schema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormShape, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormShape | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      toast.error('Fix the highlighted fields and try again.');
      return;
    }

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch('/api/admin/update-client', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, ...parsed.data }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        const message = payload.detail || payload.error || `Request failed (${res.status}).`;
        setServerError(message);
        toast.error(message);
        return;
      }
      toast.success('Profile saved.');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error.';
      setServerError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-10">
      {isArchived && (
        <Banner tone="warning">
          This client is archived (
          {new Date(initial.archivedAt!).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
          ). Edits are disabled until you restore the client.
          {initial.archivedReason && (
            <span className="mt-1 block italic">Reason: {initial.archivedReason}</span>
          )}
        </Banner>
      )}

      <Section label="Identity">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Business name"
            value={form.businessName}
            onChange={(e) => set('businessName', e.target.value)}
            error={errors.businessName}
            disabled={isArchived || submitting}
            autoComplete="organization"
            maxLength={200}
          />
          <Input
            label="Agency"
            list="agency-list"
            value={agencies.find((a) => a.id === form.agencyId)?.name ?? ''}
            onChange={(e) => {
              const match = agencies.find((a) => a.name === e.target.value);
              if (match) set('agencyId', match.id);
            }}
            error={errors.agencyId}
            disabled={isArchived || submitting || agencies.length <= 1}
            hint={agencies.length <= 1 ? 'Single-agency setup' : 'Type to transfer between agencies'}
          />
          <datalist id="agency-list">
            {agencies.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
        </div>
      </Section>

      <Section label="Contact">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Contact name"
            value={form.contactName}
            onChange={(e) => set('contactName', e.target.value)}
            error={errors.contactName}
            disabled={isArchived || submitting}
            autoComplete="name"
            maxLength={200}
            hint="Primary contact at the insured business."
          />
          <Input
            label="Contact email"
            type="email"
            value={form.contactEmail}
            onChange={(e) => set('contactEmail', e.target.value)}
            error={errors.contactEmail}
            disabled={isArchived || submitting}
            autoComplete="email"
            maxLength={320}
            hint="Used for sign-in and certificate delivery."
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            error={errors.phone}
            disabled={isArchived || submitting}
            autoComplete="tel"
            maxLength={50}
          />
        </div>
      </Section>

      <Section label="Mailing address">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Address line 1"
            value={form.businessAddress1}
            onChange={(e) => set('businessAddress1', e.target.value)}
            error={errors.businessAddress1}
            disabled={isArchived || submitting}
            autoComplete="address-line1"
            maxLength={200}
          />
          <Input
            label="Address line 2"
            value={form.businessAddress2}
            onChange={(e) => set('businessAddress2', e.target.value)}
            error={errors.businessAddress2}
            disabled={isArchived || submitting}
            autoComplete="address-line2"
            maxLength={200}
          />
        </div>
      </Section>

      <Section label="Operations">
        <div className="space-y-6">
          <Toggle
            checked={form.active}
            onChange={(e) => set('active', e.target.checked)}
            disabled={isArchived || submitting}
            label="Active"
            description="Inactive clients can't sign in or request certificates. Their data remains visible to admins."
          />
          <div className="flex items-start justify-between gap-4 border-t border-hairline pt-6">
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium leading-[1.4] text-ink">Approval mode</p>
              <p className="mt-0.5 text-[0.8125rem] leading-[1.45] text-ink-muted">
                On manual, every cert request lands in the queue for Brook to review. On auto,
                requests skip the queue once the reviewer agent passes.
              </p>
            </div>
            <ClientAutoApproveToggle
              clientId={clientId}
              initialEnabled={initial.autoApproveEnabled}
            />
          </div>
        </div>
      </Section>

      {serverError && (
        <Banner tone="danger">{serverError}</Banner>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-6">
        <ArchiveClientButton
          clientId={clientId}
          businessName={initial.businessName}
          isArchived={isArchived}
        />
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="caps text-[0.6rem] font-semibold text-ink-faint">Unsaved changes</span>
          )}
          <Button
            onClick={handleSave}
            disabled={!dirty || isArchived}
            loading={submitting}
          >
            Save profile
          </Button>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Hairline label={label} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
