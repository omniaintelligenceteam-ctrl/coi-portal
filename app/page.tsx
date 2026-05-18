import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    redirect('/login');
  }

  // Look up the authenticated client by their contact email.
  // Phase 2 will hang a coverages-selector + cert holder form off this.
  const { data: client } = await supabase
    .from('clients')
    .select('business_name')
    .eq('contact_email', user.email)
    .maybeSingle();

  const businessName = client?.business_name ?? user.email;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-gray-100 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          The Policy Place
        </h1>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900">
          Welcome, {businessName}
        </h2>
        <p className="mt-4 text-sm text-gray-600">
          Coming soon: select coverages and request a cert.
        </p>
      </main>
    </div>
  );
}
