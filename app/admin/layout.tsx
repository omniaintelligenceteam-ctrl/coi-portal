import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Header } from '../components/Header';

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
    <>
      <Header email={email} badge="Agent" />
      {children}
    </>
  );
}
