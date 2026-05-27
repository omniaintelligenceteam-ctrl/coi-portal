import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, FileText, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listForms } from '@/lib/forms/registry';
import {
  ButtonLink,
  Card,
  EmptyState,
  KeyValue,
  PageShell,
  Section,
  StaticChip,
} from '@/app/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Forms Library — every form the portal can render.
 *
 * Sources:
 *   - Code registry (lib/forms/registry.ts) — historically the only path;
 *     forms get a 'published' status by default.
 *   - DB form_templates rows — drafts authored via the visual mapper, plus
 *     any registry forms that were upserted into the DB at upload time.
 *
 * Merged into one display list. Status filter (query param ?status=) defaults
 * to showing live + draft, hiding archived.
 */

type StatusFilter = 'all' | 'published' | 'draft' | 'archived';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type FormTemplateRow = {
  id: string;
  display_name: string;
  revision: string;
  insurer_slot_count: number;
  status: 'draft' | 'published' | 'archived';
};

type DisplayForm = {
  id: string;
  displayName: string;
  revision: string;
  insurerSlotCount: number;
  status: 'draft' | 'published' | 'archived';
  /** True for forms in the code registry — they always render, even if no DB row exists. */
  inCodeRegistry: boolean;
  clientsEnabled: number;
  certsIssued: number;
};

const STATUS_TONE: Record<DisplayForm['status'], 'success' | 'warning' | 'default'> = {
  published: 'success',
  draft: 'warning',
  archived: 'default',
};
const STATUS_LABEL: Record<DisplayForm['status'], string> = {
  published: 'Live',
  draft: 'Draft',
  archived: 'Archived',
};

export default async function FormsLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const sp = await searchParams;
  const statusFilter: StatusFilter = ((['all', 'published', 'draft', 'archived'] as StatusFilter[])
    .includes(sp.status as StatusFilter)
    ? sp.status
    : 'all') as StatusFilter;

  const admin = createAdminClient();

  // Pull every form_templates row + the code registry, then merge by id.
  const [{ data: dbRowsRaw }, registryForms] = await Promise.all([
    admin
      .from('form_templates')
      .select('id, display_name, revision, insurer_slot_count, status')
      .order('display_name', { ascending: true })
      .returns<FormTemplateRow[]>(),
    Promise.resolve(listForms()),
  ]);

  const dbRows = dbRowsRaw ?? [];
  const codeIds = new Set(registryForms.map((f) => f.id));

  // Merge: prefer the DB row's status when present; fall back to 'published'
  // for code-only registry entries that lack a DB row.
  const merged: Map<string, DisplayForm> = new Map();
  for (const f of registryForms) {
    merged.set(f.id, {
      id: f.id,
      displayName: f.displayName,
      revision: f.revision,
      insurerSlotCount: f.insurerSlotCount,
      status: 'published',
      inCodeRegistry: true,
      clientsEnabled: 0,
      certsIssued: 0,
    });
  }
  for (const r of dbRows) {
    const existing = merged.get(r.id);
    merged.set(r.id, {
      id: r.id,
      displayName: r.display_name,
      revision: r.revision,
      insurerSlotCount: r.insurer_slot_count,
      status: r.status,
      inCodeRegistry: existing?.inCodeRegistry ?? codeIds.has(r.id),
      clientsEnabled: 0,
      certsIssued: 0,
    });
  }

  // Apply status filter.
  const filtered = [...merged.values()].filter((f) => {
    if (statusFilter === 'all') return f.status !== 'archived';
    return f.status === statusFilter;
  });

  // Fetch metrics per visible form in parallel.
  await Promise.all(
    filtered.map(async (f) => {
      const [{ count: clientsEnabled }, { count: certsIssued }] = await Promise.all([
        admin
          .from('coi_clients')
          .select('id', { count: 'exact', head: true })
          .contains('enabled_forms', [f.id]),
        admin
          .from('cert_requests')
          .select('id', { count: 'exact', head: true })
          .eq('form_type', f.id),
      ]);
      f.clientsEnabled = clientsEnabled ?? 0;
      f.certsIssued = certsIssued ?? 0;
    }),
  );

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <Section
        eyebrow="Library"
        title="Forms"
        description="Every form the portal can render. Upload a new ACORD-style PDF to add one without writing code — the visual mapper lets you drop fields onto the template."
        actions={
          <ButtonLink
            href="/admin/forms/new"
            size="md"
            variant="primary"
            leadingIcon={<Plus className="h-4 w-4" aria-hidden="true" />}
          >
            Upload form
          </ButtonLink>
        }
      >
        {/* Status filter tabs */}
        <div className="mb-6 flex flex-wrap gap-1 border-b border-hairline">
          {(
            [
              ['all', 'All live + drafts'],
              ['published', 'Live'],
              ['draft', 'Draft'],
              ['archived', 'Archived'],
            ] as const
          ).map(([key, label]) => {
            const active = statusFilter === key;
            return (
              <Link
                key={key}
                href={`/admin/forms?status=${key}`}
                className={`focus-ring -mb-px border-b-2 px-3.5 py-2 text-[0.78rem] font-medium transition-colors ${
                  active
                    ? 'border-brand text-brand-deep'
                    : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            tone="seal"
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            eyebrow={`No ${statusFilter === 'all' ? '' : statusFilter} forms`}
            title="Nothing here yet."
            description={
              statusFilter === 'all'
                ? 'Upload a PDF to add your first form, or register one in code via lib/forms/registry.ts.'
                : `Switch tabs to see forms in other states, or upload a new PDF to start a draft.`
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {filtered.map((form) => (
              <li key={form.id}>
                <Link
                  href={
                    form.status === 'draft'
                      ? `/admin/forms/${encodeURIComponent(form.id)}/edit`
                      : `/admin/forms/${encodeURIComponent(form.id)}`
                  }
                  className="focus-ring group block rounded-[var(--r-lg)]"
                >
                  <Card
                    padding="lg"
                    bordered
                    className="h-full transition-all duration-150 ease-out group-hover:border-ink/30 group-hover:shadow-lift"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="caps font-mono text-[0.62rem] font-semibold tracking-[0.18em] text-brand">
                          {form.id.replace(/_/g, ' ')} · {form.revision}
                        </p>
                        <h3 className="font-display mt-2 text-[1.375rem] font-medium leading-[1.15] tracking-tight text-ink">
                          {form.displayName}
                        </h3>
                      </div>
                      <StaticChip tone={STATUS_TONE[form.status]}>
                        {STATUS_LABEL[form.status]}
                      </StaticChip>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
                      <KeyValue
                        label="Clients enabled"
                        value={
                          <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
                            {form.clientsEnabled}
                          </span>
                        }
                      />
                      <KeyValue
                        label="Certs issued"
                        value={
                          <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
                            {form.certsIssued}
                          </span>
                        }
                      />
                      <KeyValue
                        label="Insurer slots"
                        value={
                          <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
                            {form.insurerSlotCount}
                          </span>
                        }
                      />
                    </div>

                    <p className="caps mt-5 inline-flex items-center gap-1.5 text-[0.6rem] font-semibold tracking-[0.18em] text-ink-muted transition-colors group-hover:text-brand">
                      {form.status === 'draft' ? 'Continue mapping' : 'View detail'}
                      <ArrowRight
                        className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        eyebrow="—"
        title="How forms get added"
        description="Two paths — pick whichever fits the form."
        className="mt-14"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card padding="md" surface="sunken">
            <p className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-brand">
              Path A · Visual mapper
            </p>
            <h4 className="font-display mt-2 text-[1.05rem] font-medium text-ink">
              Upload a PDF, drop fields, publish
            </h4>
            <ol className="mt-3 space-y-2 text-[0.85rem] leading-[1.5] text-ink-muted">
              <li>
                <span className="font-mono text-[0.75rem] text-ink">1.</span> Click Upload form
                above.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">2.</span> The mapper opens with
                anchor labels overlaid on the page.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">3.</span> Add each field from
                the dictionary; live preview updates after each save.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">4.</span> Publish when the
                layout looks right.
              </li>
            </ol>
          </Card>

          <Card padding="md" surface="sunken">
            <p className="caps text-[0.6rem] font-semibold tracking-[0.18em] text-ink-muted">
              Path B · Code registry
            </p>
            <h4 className="font-display mt-2 text-[1.05rem] font-medium text-ink">
              Engineer registers it in TypeScript
            </h4>
            <ol className="mt-3 space-y-2 text-[0.85rem] leading-[1.5] text-ink-muted">
              <li>
                <span className="font-mono text-[0.75rem] text-ink">1.</span> Drop assets under{' '}
                <code className="font-mono text-[0.78rem] text-ink">assets/</code>.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">2.</span> Author{' '}
                <code className="font-mono text-[0.78rem] text-ink">lib/forms/&lt;id&gt;/</code>{' '}
                with coordinates and a renderer.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">3.</span> Register in{' '}
                <code className="font-mono text-[0.78rem] text-ink">lib/forms/registry.ts</code>.
              </li>
              <li>
                <span className="font-mono text-[0.75rem] text-ink">4.</span> Run{' '}
                <code className="font-mono text-[0.78rem] text-ink">npm run cert-doctor</code>{' '}
                to verify overlay precision.
              </li>
            </ol>
            <p className="mt-3 text-[0.75rem] italic text-ink-faint">
              Use when the form needs custom rendering logic the dictionary doesn't cover.
            </p>
          </Card>
        </div>
      </Section>
    </PageShell>
  );
}
