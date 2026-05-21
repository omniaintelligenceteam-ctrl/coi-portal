import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Header } from '../components/Header';
import { CommandPalette } from './CommandPalette';
import { SidebarNav } from './SidebarNav';

/**
 * Admin layout — Statement Phase 2a.
 *
 * Replaced the prior <AdminTabs /> horizontal strip with a persistent
 * <SidebarNav /> on desktop (md+). Mobile users continue to navigate via
 * the existing drawer surfaced from <Header />.
 *
 * Layout shape:
 *   Header (full width, sticky)
 *   ├── SidebarNav (desktop only, sticky left rail)
 *   └── main content (children)
 *
 * Sidebar badges (queue, clients, access pending count) get fetched here
 * once so they're always fresh on layout-level renders.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

type AgencyRow = { contact_name: string | null; name: string | null };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const email = user?.email?.toLowerCase();
  if (!email) redirect('/login');
  if (!adminEmails().includes(email)) redirect('/');

  // Sidebar context: badges (queue + access counts) + user identity.
  const admin = createAdminClient();
  const [
    { count: queueCount },
    { count: accessCount },
    { data: agency },
  ] = await Promise.all([
    admin
      .from('cert_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'reviewed']),
    admin
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then((r) => (r.error ? { count: 0 } : r)) // table may not exist in older envs
      .catch(() => ({ count: 0 })),
    process.env.BRAND_AGENCY_ID
      ? admin
          .from('agencies')
          .select('contact_name, name')
          .eq('id', process.env.BRAND_AGENCY_ID)
          .maybeSingle<AgencyRow>()
      : Promise.resolve({ data: null as AgencyRow | null }),
  ]);

  const userName = agency?.contact_name ?? deriveName(email);
  const initials = userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

  return (
    <>
      <Header email={email} badge="Agent" />
      <div className="flex w-full">
        <SidebarNav
          brand={{ mark: 'P', name: agency?.name ?? 'The Policy Place' }}
          user={{ initials, name: userName, role: 'Producer' }}
          badges={{
            queue: queueCount ?? undefined,
            access: accessCount ?? undefined,
          }}
        />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      <CommandPalette />
    </>
  );
}

function deriveName(email: string): string {
  const local = email.split('@')[0] ?? 'admin';
  return local
    .split(/[._]/)
    .map((part) => part.replace(/^./, (c) => c.toUpperCase()))
    .join(' ');
}
