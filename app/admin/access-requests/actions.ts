'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  sendAccessApprovedEmail,
  sendAccessRejectedEmail,
} from '@/lib/email';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');
  return email;
}

async function defaultAgencyId(admin: ReturnType<typeof createAdminClient>): Promise<string> {
  const { data, error } = await admin
    .from('agencies')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();
  if (error || !data) throw new Error('No agency configured.');
  return data.id;
}

/**
 * Approve a pending access request. Creates a coi_clients row (using the
 * business name the admin entered/confirmed) and emails the requester a
 * sign-in link. Idempotent: if a coi_clients row with that email already
 * exists, links to it instead of erroring.
 */
export async function approveAccessRequest(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get('id') ?? '').trim();
  const businessName = String(formData.get('businessName') ?? '').trim();
  if (!id || !businessName) {
    redirect(`/admin/access-requests?error=missing_fields`);
  }

  const admin = createAdminClient();
  const decidedBy = (await requireAdmin()).toLowerCase();

  const { data: req, error: fetchErr } = await admin
    .from('access_requests')
    .select('id, email, business_name, source, status')
    .eq('id', id)
    .maybeSingle<{ id: string; email: string; business_name: string; source: 'self_signup' | 'admin_invite'; status: string }>();
  if (fetchErr || !req) redirect(`/admin/access-requests?error=not_found`);
  if (req.status !== 'pending') {
    redirect(`/admin/access-requests?error=already_decided`);
  }

  // Reuse existing coi_clients row if one already has this email.
  const { data: existing } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', req.email)
    .maybeSingle<{ id: string }>();

  let clientId: string;
  if (existing) {
    clientId = existing.id;
  } else {
    const agencyId = await defaultAgencyId(admin);
    const { data: created, error: createErr } = await admin
      .from('coi_clients')
      .insert({
        agency_id: agencyId,
        business_name: businessName,
        contact_email: req.email,
        active: true,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      redirect(`/admin/access-requests?error=create_failed`);
    }
    clientId = created.id;
  }

  const { error: updateErr } = await admin
    .from('access_requests')
    .update({
      status: 'approved',
      decided_by_email: decidedBy,
      decided_at: new Date().toISOString(),
      linked_client_id: clientId,
    })
    .eq('id', id);
  if (updateErr) {
    redirect(`/admin/access-requests?error=update_failed`);
  }

  try {
    await sendAccessApprovedEmail({
      to: req.email,
      businessName,
      source: req.source,
    });
  } catch (err) {
    console.error('access-approved email failed', err);
  }

  revalidatePath('/admin/access-requests');
  redirect(`/admin/access-requests?ok=approved`);
}

export async function rejectAccessRequest(formData: FormData): Promise<void> {
  const decidedBy = (await requireAdmin()).toLowerCase();
  const id = String(formData.get('id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!id) redirect(`/admin/access-requests?error=missing_fields`);

  const admin = createAdminClient();
  const { data: req, error: fetchErr } = await admin
    .from('access_requests')
    .select('id, email, business_name, status')
    .eq('id', id)
    .maybeSingle<{ id: string; email: string; business_name: string; status: string }>();
  if (fetchErr || !req) redirect(`/admin/access-requests?error=not_found`);
  if (req.status !== 'pending') {
    redirect(`/admin/access-requests?error=already_decided`);
  }

  const { error: updateErr } = await admin
    .from('access_requests')
    .update({
      status: 'rejected',
      decided_by_email: decidedBy,
      decided_at: new Date().toISOString(),
      decision_note: reason || null,
    })
    .eq('id', id);
  if (updateErr) redirect(`/admin/access-requests?error=update_failed`);

  try {
    await sendAccessRejectedEmail({
      to: req.email,
      businessName: req.business_name,
      reason,
    });
  } catch (err) {
    console.error('access-rejected email failed', err);
  }

  revalidatePath('/admin/access-requests');
  redirect(`/admin/access-requests?ok=rejected`);
}

/**
 * Admin-initiated invite. Creates a coi_clients row directly and emails the
 * person their sign-in link. Logged in access_requests with source='admin_invite'
 * and status='approved' for the audit trail.
 */
export async function inviteClient(formData: FormData): Promise<void> {
  const decidedBy = (await requireAdmin()).toLowerCase();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const businessName = String(formData.get('businessName') ?? '').trim();
  const contactName = String(formData.get('contactName') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!EMAIL_RE.test(email) || !businessName) {
    redirect('/admin/access-requests?error=invalid_invite');
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', email)
    .maybeSingle<{ id: string }>();

  let clientId: string;
  if (existing) {
    clientId = existing.id;
  } else {
    const agencyId = await defaultAgencyId(admin);
    const { data: created, error: createErr } = await admin
      .from('coi_clients')
      .insert({
        agency_id: agencyId,
        business_name: businessName,
        contact_email: email,
        active: true,
      })
      .select('id')
      .single();
    if (createErr || !created) {
      redirect('/admin/access-requests?error=invite_failed');
    }
    clientId = created.id;
  }

  await admin.from('access_requests').insert({
    email,
    business_name: businessName,
    contact_name: contactName,
    phone,
    source: 'admin_invite',
    status: 'approved',
    decided_by_email: decidedBy,
    decided_at: new Date().toISOString(),
    linked_client_id: clientId,
  });

  try {
    await sendAccessApprovedEmail({
      to: email,
      businessName,
      source: 'admin_invite',
    });
  } catch (err) {
    console.error('invite email failed', err);
  }

  revalidatePath('/admin/access-requests');
  redirect('/admin/access-requests?ok=invited');
}
