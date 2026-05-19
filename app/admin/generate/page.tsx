import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';

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
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <header className="mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Generate on behalf of</p>
        <h1 className="font-display mt-3 text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
          Pick a client.
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Choose the insured this certificate is for. You'll get their in-force coverages and
          saved holders on the next screen — the cert will be audit-trailed back to your account.
        </p>
      </header>

      <Hairline className="mb-8" />

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No active clients found. Add one before generating a certificate.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((c) => (
            <Link
              key={c.id}
              href={`/admin/generate/${c.id}`}
              className="focus-ring group flex items-center justify-between gap-4 rounded-lg border border-hairline bg-card px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:border-hairline-strong hover:shadow-lift"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{c.business_name}</p>
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
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-brand" />
            </Link>
          ))}
        </div>
      )}

      <p className="caps mt-8 text-[0.6rem] font-medium text-ink-faint">
        {rows.length} active {rows.length === 1 ? 'client' : 'clients'}
      </p>
    </main>
  );
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
