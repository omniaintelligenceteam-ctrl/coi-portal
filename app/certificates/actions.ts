'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Statuses the client may retract themselves. sent/approved/edited are
// records-of-action — only admin can blow those away.
const CLIENT_DELETABLE = new Set(['pending', 'reviewed', 'rejected']);

/**
 * Delete one of the caller's own cert_requests.
 * Ownership is enforced by RLS: the cookie client can only SELECT rows whose
 * client.contact_email matches auth.email(). If the maybeSingle() comes back
 * null, either the row doesn't exist or it isn't theirs — both refuse.
 * Delete then runs through service-role because cert_requests has no write
 * policy.
 */
export async function deleteOwnCertRequest(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/certificates');

  const { data: row } = await supabase
    .from('cert_requests')
    .select('id, status')
    .eq('id', id)
    .maybeSingle<{ id: string; status: string }>();

  if (!row) redirect('/certificates?error=not_found');
  if (!CLIENT_DELETABLE.has(row.status)) {
    redirect('/certificates?error=not_deletable');
  }

  const admin = createAdminClient();
  const { error } = await admin.from('cert_requests').delete().eq('id', id);
  if (error) redirect('/certificates?error=delete_failed');

  revalidatePath('/certificates');
  redirect('/certificates?deleted=1');
}
