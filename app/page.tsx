import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { selectableCoverages, type DbPolicy } from '@/lib/getClientPolicies';
import { CoverageForm, type PolicyForForm } from './CoverageForm';

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

  if (!user?.email) {
    redirect('/login');
  }

  const { data: client } = await supabase
    .from('coi_clients')
    .select('id, business_name, business_address1, business_address2')
    .eq('contact_email', user.email)
    .maybeSingle<ClientRow>();

  if (!client) {
    return <NoClientFound email={user.email} />;
  }

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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            The Policy Place
          </h1>
          <span className="text-xs text-gray-500">{user.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{client.business_name}</h2>
          {client.business_address1 && (
            <p className="mt-1 text-sm text-gray-600">
              {client.business_address1}
              {client.business_address2 ? `, ${client.business_address2}` : ''}
            </p>
          )}
        </div>

        {policiesForForm.length === 0 ? (
          <NoActivePolicies />
        ) : (
          <CoverageForm clientId={client.id} policies={policiesForForm} />
        )}

        <aside className="mt-10 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Need something not shown above?</p>
          <p className="mt-1">
            If your contract requires Additional Insured status, Waiver of Subrogation, or custom
            language that doesn&apos;t appear on this form, those must be set up by Brook before
            they can appear on a certificate. Reach out to{' '}
            <a className="underline" href="mailto:brook@yourpolicyplace.com">
              brook@yourpolicyplace.com
            </a>
            .
          </p>
        </aside>
      </main>
    </div>
  );
}

function NoClientFound({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h2 className="text-xl font-semibold text-gray-900">Account not found</h2>
        <p className="mt-3 text-sm text-gray-600">
          We don&apos;t have a Policy Place client account associated with{' '}
          <span className="font-medium">{email}</span>.
        </p>
        <p className="mt-3 text-sm text-gray-600">
          If you should have access, please contact{' '}
          <a className="underline" href="mailto:brook@yourpolicyplace.com">
            brook@yourpolicyplace.com
          </a>
          .
        </p>
      </main>
    </div>
  );
}

function NoActivePolicies() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-6">
      <h3 className="font-semibold text-amber-900">No active policies on file</h3>
      <p className="mt-2 text-sm text-amber-800">
        We don&apos;t see any active, in-force policies for your account right now. Please reach
        out to Brook to confirm your coverage status before requesting a certificate.
      </p>
    </div>
  );
}
