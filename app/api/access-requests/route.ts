import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendAccessRequestNotification } from '@/lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

type Body = {
  email?: string;
  businessName?: string;
  contactName?: string;
  phone?: string;
  message?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const businessName = (body.businessName ?? '').trim().slice(0, 200);
  const contactName = (body.contactName ?? '').trim() || null;
  const phone = (body.phone ?? '').trim() || null;
  const message = (body.message ?? '').trim().slice(0, 2000) || null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }
  if (adminEmails().includes(email.toLowerCase())) {
    return NextResponse.json(
      { error: 'This email cannot be registered for portal access.' },
      { status: 403 },
    );
  }
  if (!businessName) {
    return NextResponse.json({ error: 'Business name is required.' }, { status: 400 });
  }

  const admin = createAdminClient();

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;

  // Per-IP throttle — this endpoint is unauthenticated and every accepted
  // request inserts a row + emails every admin. Same count-recent pattern as
  // the cert rate limit in lib/certPipeline.ts.
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from('access_requests')
      .select('*', { count: 'exact', head: true })
      .eq('requested_ip', ip)
      .gte('requested_at', oneHourAgo);
    if ((count ?? 0) >= 5) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }
  }

  // If they already have an approved coi_clients row, or an open pending
  // request, do nothing — but return the SAME generic response as a fresh
  // submission. Distinct responses let an unauthenticated caller enumerate
  // which emails are Policy Place clients.
  const { data: existingClient } = await admin
    .from('coi_clients')
    .select('id')
    .eq('contact_email', email)
    .maybeSingle();
  if (existingClient) {
    return NextResponse.json({ ok: true });
  }

  const { data: existingPending } = await admin
    .from('access_requests')
    .select('id')
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle();
  if (existingPending) {
    return NextResponse.json({ ok: true });
  }

  const { data: inserted, error } = await admin
    .from('access_requests')
    .insert({
      email,
      business_name: businessName,
      contact_name: contactName,
      phone,
      message,
      source: 'self_signup',
      requested_ip: ip,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ error: 'Could not save your request. Try again.' }, { status: 500 });
  }

  // Fire-and-forget notify — failure doesn't fail the request (we have the row).
  try {
    await sendAccessRequestNotification({
      requestId: inserted.id,
      email,
      businessName,
      contactName,
      phone,
      message,
    });
  } catch (err) {
    console.error('access-request notification failed', err);
  }

  return NextResponse.json({ ok: true, requestId: inserted.id });
}
