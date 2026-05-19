'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Permanently delete a cert_request. Admin-only.
 * Service-role bypasses the cert_requests RLS (no write policies exist).
 * client_overrides.source_request_id is ON DELETE SET NULL — institutional
 * memory survives. coi_audit is independent — sent-cert audit trail survives.
 */
export async function deleteCertRequest(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/admin/queue');

  const admin = createAdminClient();
  const { error } = await admin.from('cert_requests').delete().eq('id', id);
  if (error) redirect(`/admin/queue/${id}?error=delete_failed`);

  revalidatePath('/admin/queue');
  redirect('/admin/queue?deleted=1');
}
