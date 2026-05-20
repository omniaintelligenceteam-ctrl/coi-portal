import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { OverridesEditor, type OverrideRow } from './OverridesEditor';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClientRow = { id: string; business_name: string };

export default async function ClientOverridesPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('coi_clients')
    .select('id, business_name')
    .eq('id', clientId)
    .maybeSingle<ClientRow>();
  if (!client) notFound();

  const { data: overrides } = await admin
    .from('client_overrides')
    .select('id, scope, pattern, correction, added_by, added_at')
    .eq('client_id', clientId)
    .eq('active', true)
    .order('added_at', { ascending: false })
    .returns<OverrideRow[]>();

  return (
    <main className="mx-auto w-full max-w-5xl px-8 pb-24 pt-10 sm:px-12 sm:pt-12 lg:px-20 lg:pt-16 xl:px-32">
      <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/settings/clients"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to clients
      </Link>

      <header className="mt-6 mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Reviewer overrides</p>
        <h1 className="font-display mt-3 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          {client.business_name}
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Notes the reviewer reads before scoring every cert for this client. Use them to teach
          the system one-off rules — naming conventions, address aliases, special phrasing.
        </p>
      </header>

      <Hairline className="mb-8" />

      <OverridesEditor clientId={client.id} initial={overrides ?? []} />
      </div>
    </main>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}
