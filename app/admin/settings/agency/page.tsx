import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Hairline } from '@/app/components/Hairline';
import { AgencyForm } from './AgencyForm';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type AgencyRow = {
  id: string;
  name: string;
  address1: string | null;
  address2: string | null;
  contact_name: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  license_no: string | null;
};

export default async function AgencySettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  // Single-tenant: just take the first agency row. agency_id is already in
  // the schema for future white-label, but for Brook there's exactly one.
  const { data: agency } = await admin
    .from('agencies')
    .select(
      `id, name, address1, address2, contact_name, phone, fax, email, license_no`,
    )
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<AgencyRow>();
  if (!agency) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
      <Link
        href="/admin/settings"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.62rem] font-medium text-ink-muted hover:text-ink"
      >
        ← Back to settings
      </Link>

      <header className="mt-6 mb-8">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Producer</p>
        <h1 className="mt-3 font-display text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
          Your agency on the cert.
        </h1>
        <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-ink-muted">
          These values fill the Producer block on every certificate you issue. Changes here apply
          to all future renders — existing certs keep the values that were live when they were sent.
        </p>
      </header>

      <Hairline className="mb-8" />

      <AgencyForm
        agencyId={agency.id}
        initial={{
          name: agency.name ?? '',
          address1: agency.address1 ?? '',
          address2: agency.address2 ?? '',
          contactName: agency.contact_name ?? '',
          phone: agency.phone ?? '',
          fax: agency.fax ?? '',
          email: agency.email ?? '',
          licenseNo: agency.license_no ?? '',
        }}
      />
    </main>
  );
}
