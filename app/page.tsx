import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm } from './CoverageForm';
import { Header } from './components/Header';

type ClientRow = {
  id: string;
  business_name: string;
  business_address1: string | null;
  business_address2: string | null;
};

type PolicyRow = DbPolicy & {
  policy_number: string;
  addl_insured_blanket: boolean;
  subrogation_waived: boolean;
  description: string | null;
  insurer: { name: string; naic: string } | null;
};

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const { data: client } = await supabase
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2')
    .eq('contact_email', user.email)
    .maybeSingle<ClientRow>();

  if (!client) return <NoClientFound email={user.email} />;

  const { data: policiesRaw } = await supabase
    .from('policies')
    .select(
      `id, type, policy_number, eff_date, exp_date, active,
       addl_insured_blanket, subrogation_waived, description,
       insurer:insurers ( name, naic )`,
    )
    .eq('client_id', client.id)
    .order('exp_date', { ascending: false })
    .returns<PolicyRow[]>();

  const eligible = selectableCoverages(policiesRaw ?? [], new Date());

  const policiesForForm: PolicyForForm[] = eligible.map((p) => ({
    id: p.id,
    type: p.type,
    policyNumber: p.policy_number,
    effDate: p.eff_date,
    expDate: p.exp_date,
    insurerName: p.insurer?.name ?? 'Unknown insurer',
    addlInsuredBlanket: p.addl_insured_blanket,
    subrogationWaived: p.subrogation_waived,
    description: p.description ?? '',
  }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Header email={user.email} />

      <main className="mx-auto max-w-2xl px-6 py-10">
        {/* Insured identity card */}
        <div className="mb-6 rounded-xl bg-white border border-slate-200 shadow-sm px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Insured
          </p>
          <h2 className="text-xl font-bold text-slate-900">{client.business_name}</h2>
          {client.business_address1 && (
            <p className="mt-0.5 text-sm text-slate-500">
              {client.business_address1}
              {client.business_address2 ? `, ${client.business_address2}` : ''}
            </p>
          )}
        </div>

        {/* Form card */}
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm px-6 py-7">
          <h3 className="text-base font-semibold text-slate-900">Request a Certificate</h3>
          <p className="mt-1 text-sm text-slate-500 mb-7">
            Select the coverages to include and enter the certificate holder. Brook will review and
            send within a few business hours.
          </p>

          {policiesForForm.length === 0 ? <NoActivePolicies /> : (
            <CoverageForm clientId={client.id} policies={policiesForForm} />
          )}
        </div>

        {/* Info callout */}
        <div className="mt-5 rounded-xl border border-kyblue-200 bg-kyblue-50 px-5 py-4">
          <p className="text-sm font-semibold text-kyblue-900">Need something not shown above?</p>
          <p className="mt-1 text-sm text-kyblue-800 leading-relaxed">
            If your contract requires Additional Insured status, Waiver of Subrogation, or custom
            language, those must be set up by Brook before they can appear on a certificate.{' '}
            <a className="underline font-medium" href="mailto:brook@yourpolicyplace.com">
              brook@yourpolicyplace.com
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

function NoClientFound({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-auto px-6 py-16 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 mb-6">
          <svg className="h-6 w-6 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-900">Account not found</h2>
        <p className="mt-2 text-sm text-slate-600">
          No Policy Place account is linked to{' '}
          <span className="font-semibold text-slate-800">{email}</span>.
        </p>
        <p className="mt-1 text-sm text-slate-500">
          Contact{' '}
          <a className="text-kyblue-500 underline" href="mailto:brook@yourpolicyplace.com">
            brook@yourpolicyplace.com
          </a>{' '}
          to get access.
        </p>
      </div>
    </div>
  );
}

function NoActivePolicies() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
      <p className="font-semibold text-amber-900 text-sm">No active policies on file</p>
      <p className="mt-1 text-sm text-amber-800">
        We don&apos;t see any in-force policies for your account right now. Please reach out to
        Brook to confirm your coverage status before requesting a certificate.
      </p>
    </div>
  );
}
