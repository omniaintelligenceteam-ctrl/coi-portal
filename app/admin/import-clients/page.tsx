/**
 * Admin page — bulk-import clients from a CSV/spreadsheet.
 *
 * Designed for the broker handoff flow: paste or drop a CSV (template lives
 * at docs/intake/client-roster-template.csv), preview every row's outcome
 * (insert / update / error), and commit in one click.
 *
 * Server-rendered for auth + agency lookup; the interactive parse/preview/
 * submit happens in ClientImportForm (client component).
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PageHeader, PageShell } from '@/app/components/ui';
import { listForms } from '@/lib/forms/registry';
import ClientImportForm from './ClientImportForm';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type AgencyOption = { id: string; name: string };

export default async function ImportClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();

  const { data: agencies } = await admin
    .from('agencies')
    .select('id, name')
    .order('name')
    .returns<AgencyOption[]>();

  const knownForms = listForms().map((f) => ({
    id: f.id,
    displayName: f.displayName,
    revision: f.revision,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Import Clients"
        subtitle="Bulk-onboard a roster from a CSV. Preview every row before committing — duplicates are surfaced, unknown form codes are blocked."
      />
      <ClientImportForm
        agencies={agencies ?? []}
        knownForms={knownForms}
      />
    </PageShell>
  );
}
