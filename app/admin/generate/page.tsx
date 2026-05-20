import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { EmptyState, PageHeader } from '@/app/components/ui';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClientRow = {
  id: string;
  business_name: string;
  contact_email: string | null;
  business_address1: string | null;
};

export default async function GenerateLandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('coi_clients')
    .select('id, business_name, contact_email, business_address1')
    .eq('active', true)
    .order('business_name')
    .returns<ClientRow[]>();

  const rows = clients ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-8 pb-24 pt-8 sm:px-12 sm:pt-12 lg:px-20 lg:pt-14 xl:px-32">
      <PageHeader
        eyebrow={
          <>
            <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
            Generate on behalf of
          </>
        }
        title="Pick a client."
        subtitle="Choose the insured this certificate is for. You'll get their in-force coverages and saved holders on the next screen — the cert will be audit-trailed back to your account."
      />

      <div className="mt-10">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" aria-hidden="true" />}
            eyebrow="No clients"
            title="No active clients found."
            description="Add one before generating a certificate."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((c) => (
              <Link
                key={c.id}
                href={`/admin/generate/${c.id}`}
                className="focus-ring group flex items-center justify-between gap-4 rounded-[var(--r-md)] border border-hairline bg-card px-5 py-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
              >
                <div className="min-w-0">
                  <p className="font-display truncate text-[1.05rem] font-medium leading-[1.2] text-ink">
                    {c.business_name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[0.72rem] text-ink-muted">
                    {c.contact_email ?? '—'}
                    {c.business_address1 && (
                      <>
                        <span className="text-ink-faint">{'  ·  '}</span>
                        {c.business_address1}
                      </>
                    )}
                  </p>
                </div>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand-deep"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        )}

        <p className="caps mt-8 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
          {rows.length} active {rows.length === 1 ? 'client' : 'clients'}
        </p>
      </div>
    </main>
  );
}
