/**
 * Public holder request page — reached via a client's shared holder link.
 *
 * A certificate holder (GC, landlord, project owner) lands here, enters who
 * the certificate should name, and the request files into the insured's
 * normal approval pipeline. No login, no account: the unguessable token in
 * the URL scopes everything to one insured business.
 */

import { notFound } from 'next/navigation';
import { PageShell } from '@/app/components/ui';
import { createAdminClient } from '@/lib/supabase/admin';
import { HolderRequestForm } from './HolderRequestForm';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function HolderRequestPage({ params }: PageProps) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();

  const admin = createAdminClient();
  const { data: client } = await admin
    .from('coi_clients')
    .select('business_name, active, archived_at')
    .eq('holder_link_token', token)
    .maybeSingle<{ business_name: string; active: boolean; archived_at: string | null }>();
  if (!client || !client.active || client.archived_at) notFound();

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      <div className="mx-auto max-w-xl">
        <header>
          <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
            Certificate of Insurance
          </p>
          <h1 className="mt-3 font-display text-[2rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2.5rem]">
            Request a certificate from{' '}
            <span className="text-brand">{client.business_name}</span>.
          </h1>
          <p className="mt-4 text-[0.9375rem] leading-[1.6] text-ink-muted">
            Tell us who the certificate should name as the holder. The request goes straight to{' '}
            {client.business_name}&apos;s insurance agency — most certificates go out the same
            business day.
          </p>
        </header>

        <div className="mt-10">
          <HolderRequestForm token={token} businessName={client.business_name} />
        </div>
      </div>
    </PageShell>
  );
}
