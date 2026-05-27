import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listForms } from '@/lib/forms/registry';
import { Card, EmptyState, KeyValue, PageShell, Section, StaticChip } from '@/app/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Forms Library — the "one spot" admin surface listing every form the portal
 * can render. Source of truth is the code-side registry (lib/forms/registry.ts).
 * The DB-side form_templates table mirrors the registry for cross-referencing
 * (revision, sha256, etc.) and surfacing forms that are seeded but not yet
 * wired up in code as "Coming soon" — but Phase 1 doesn't ship any of those.
 *
 * For each registered form we fetch two live metrics in parallel:
 *   - clientsEnabled — how many coi_clients have this form in enabled_forms[]
 *   - certsIssued    — how many cert_requests (any status) used this form_type
 *
 * Adding a new form = engineering work (see plan in /admin/forms/[formId]
 * "How forms get added"). No upload UI in V1; that's Phase 3.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function FormsLibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const forms = listForms();

  // Parallel fetch of metrics for every registered form. Each form needs:
  //   - clients with this form in enabled_forms[] (GIN-indexed contains query)
  //   - cert_requests rows with form_type = this id
  const metrics = await Promise.all(
    forms.map(async (form) => {
      const [{ count: clientsEnabled }, { count: certsIssued }] = await Promise.all([
        admin
          .from('coi_clients')
          .select('id', { count: 'exact', head: true })
          .contains('enabled_forms', [form.id]),
        admin
          .from('cert_requests')
          .select('id', { count: 'exact', head: true })
          .eq('form_type', form.id),
      ]);
      return {
        formId: form.id,
        clientsEnabled: clientsEnabled ?? 0,
        certsIssued: certsIssued ?? 0,
      };
    }),
  );

  const metricsById = new Map(metrics.map((m) => [m.formId, m]));

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <Section
        eyebrow="Library"
        title="Forms"
        description="Every form the portal can render, plus how many clients have each one enabled. Adding a form to the library is an engineering change — toggle per-client visibility from a client's Forms tab."
      >
        {forms.length === 0 ? (
          <EmptyState
            tone="seal"
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            eyebrow="No forms registered"
            title="The form registry is empty."
            description="Forms get registered in lib/forms/registry.ts. Once a form lands there with its template assets, it appears here automatically."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-2">
            {forms.map((form) => {
              const m = metricsById.get(form.id);
              return (
                <li key={form.id}>
                  <Link
                    href={`/admin/forms/${encodeURIComponent(form.id)}`}
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
                            {form.id.replace('_', ' ')} · {form.revision}
                          </p>
                          <h3 className="font-display mt-2 text-[1.375rem] font-medium leading-[1.15] tracking-tight text-ink">
                            {form.displayName}
                          </h3>
                        </div>
                        <StaticChip tone="success">Live</StaticChip>
                      </div>

                      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-hairline pt-4">
                        <KeyValue
                          label="Clients enabled"
                          value={
                            <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
                              {m?.clientsEnabled ?? 0}
                            </span>
                          }
                        />
                        <KeyValue
                          label="Certs issued"
                          value={
                            <span className="num-tabular font-mono text-[1rem] font-medium text-ink">
                              {m?.certsIssued ?? 0}
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
                        View detail
                        <ArrowRight
                          className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </p>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section
        eyebrow="—"
        title="How forms get added"
        description="The simple path: engineering registers each new ACORD with its template assets and field mappings. Adding a form is a code change; managing which clients use it is not."
        className="mt-14"
      >
        <Card padding="md" surface="sunken">
          <ol className="space-y-2.5 text-[0.875rem] leading-[1.55] text-ink-muted">
            <li>
              <span className="font-mono text-[0.78rem] text-ink">1.</span> Drop the blank ACORD
              PDF + rasterized page-1 PNG under <code className="font-mono text-[0.78rem] text-ink">assets/</code>.
            </li>
            <li>
              <span className="font-mono text-[0.78rem] text-ink">2.</span> Author{' '}
              <code className="font-mono text-[0.78rem] text-ink">lib/forms/&lt;id&gt;/</code> with
              field coordinates and a renderer.
            </li>
            <li>
              <span className="font-mono text-[0.78rem] text-ink">3.</span> Register the FormConfig
              in <code className="font-mono text-[0.78rem] text-ink">lib/forms/registry.ts</code>.
            </li>
            <li>
              <span className="font-mono text-[0.78rem] text-ink">4.</span> Add a row to{' '}
              <code className="font-mono text-[0.78rem] text-ink">form_templates</code> via migration.
            </li>
            <li>
              <span className="font-mono text-[0.78rem] text-ink">5.</span> Run{' '}
              <code className="font-mono text-[0.78rem] text-ink">npm run cert-doctor --form &lt;id&gt;</code>{' '}
              to verify overlay precision before ship.
            </li>
          </ol>
        </Card>
      </Section>
    </PageShell>
  );
}
