import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/**
 * Admin layout — Brook (and Wes during demo) only.
 *
 * Allowlist via ADMIN_EMAILS env var, comma-separated. Anyone whose
 * authenticated email matches gets in; everyone else is redirected to /.
 */
function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!email) redirect('/login');
  if (!adminEmails().includes(email)) redirect('/');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-gray-900 text-gray-100 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/admin/queue" className="text-sm font-semibold tracking-tight">
            The Policy Place — Admin
          </Link>
          <span className="text-xs text-gray-400">{email}</span>
        </div>
      </header>
      {children}
    </div>
  );
}
