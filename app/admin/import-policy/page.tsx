import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { PolicyImportForm } from './PolicyImportForm';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type ClientOption = { id: string; business_name: string };

export default async function ImportPolicyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const { data: clients } = await admin
    .from('coi_clients')
    .select('id, business_name')
    .eq('active', true)
    .order('business_name')
    .returns<ClientOption[]>();

  if (!clients?.length) {
    return (
      <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
        <p className="text-sm text-ink-muted">No active clients found. Add a client first.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <Link
        href="/admin/queue"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="h-3 w-3" />
        Back to queue
      </Link>

      <header className="mt-6 mb-10">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">AI Policy Intake</p>
        <h1 className="font-display mt-3 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          Import a declarations page.
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          Upload a carrier declarations page (PDF or image) and Claude will extract the policy
          details. Review and confirm before saving to the client's account.
        </p>
      </header>

      <Hairline className="mb-10" />

      <PolicyImportForm clients={clients} />
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
