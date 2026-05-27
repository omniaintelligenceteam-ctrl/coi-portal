import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageShell, Section } from '@/app/components/ui';
import { NewFormWizard } from './NewFormWizard';

export const dynamic = 'force-dynamic';

/**
 * Upload-form wizard. Single-step today: pick a PDF, name it, give it a
 * revision + a stable formId, submit. Backend rasterizes + extracts + drops
 * a draft row. Redirects to the mapper for field placement.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function NewFormPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  return (
    <PageShell as="main" width="narrow" className="page-pad-top page-pad-bot">
      <Link
        href="/admin/forms"
        className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-muted transition-colors hover:text-ink"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to forms
      </Link>

      <Section
        eyebrow="New form"
        title="Upload a form template"
        description="Drop a blank ACORD-style PDF. We'll rasterize page 1 and extract every text label so you can drop fields onto the form visually. Adding fields happens next."
        className="mt-6"
      >
        <NewFormWizard />
      </Section>
    </PageShell>
  );
}
