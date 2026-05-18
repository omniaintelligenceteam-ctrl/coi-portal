/**
 * Vercel Cron: daily policy expiry scanner.
 * Schedule: 0 14 * * * (2 PM UTC / ~10 AM Eastern)
 *
 * Sends clients an email warning when a policy expires in ~30 days or ~7 days.
 * Notifies Brook at 7-day mark so she can follow up.
 *
 * Auth: Vercel passes `Authorization: Bearer ${CRON_SECRET}` on cron-triggered calls.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendExpiryWarningEmail } from '@/lib/email';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

const POLICY_TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

type PolicyWithClient = {
  id: string;
  type: string;
  policy_number: string;
  exp_date: string;
  client: {
    business_name: string;
    contact_email: string;
  } | null;
  agency: {
    phone: string | null;
    email: string | null;
  } | null;
};

function isoDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatExpDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

async function scanWindow(
  admin: ReturnType<typeof createAdminClient>,
  targetDate: string,
  windowDate: string,
  daysLabel: number,
) {
  const { data: policies, error } = await admin
    .from('policies')
    .select(
      `id, type, policy_number, exp_date,
       client:coi_clients ( business_name, contact_email ),
       agency:agencies ( phone, email )`,
    )
    .eq('active', true)
    .gte('exp_date', targetDate)
    .lte('exp_date', windowDate)
    .returns<PolicyWithClient[]>();

  if (error) {
    log.error('cron.renewals.fetch_failed', { error: error.message, daysLabel });
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const adminEmails = (process.env.ADMIN_EMAILS ?? 'wesoverstreet@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const policy of policies ?? []) {
    const contactEmail = policy.client?.contact_email;
    if (!contactEmail) continue;

    try {
      await sendExpiryWarningEmail({
        to: contactEmail,
        cc: daysLabel <= 7 ? adminEmails : undefined,
        businessName: policy.client?.business_name ?? 'Valued Client',
        policyType: POLICY_TYPE_LABEL[policy.type] ?? policy.type,
        policyNumber: policy.policy_number,
        expDateFormatted: formatExpDate(policy.exp_date),
        daysUntilExpiry: daysLabel,
        agentEmail: policy.agency?.email ?? 'brook@yourpolicyplace.com',
        agentPhone: policy.agency?.phone ?? '270-410-2015',
      });
      sent++;
      log.info('cron.renewals.sent', {
        policyId: policy.id,
        daysUntilExpiry: daysLabel,
        to: contactEmail,
      });
    } catch (err) {
      failed++;
      log.error('cron.renewals.send_failed', {
        policyId: policy.id,
        daysUntilExpiry: daysLabel,
        error: (err as Error).message,
      });
    }
  }

  return { sent, failed };
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret (skip in dev when CRON_SECRET is unset)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const today = new Date();
  const admin = createAdminClient();

  // 30-day window: exp_date between today+29 and today+31
  const w30start = isoDateString(addDays(today, 29));
  const w30end = isoDateString(addDays(today, 31));

  // 7-day window: exp_date between today+6 and today+8
  const w7start = isoDateString(addDays(today, 6));
  const w7end = isoDateString(addDays(today, 8));

  log.info('cron.renewals.start', { date: isoDateString(today) });

  const [result30, result7] = await Promise.all([
    scanWindow(admin, w30start, w30end, 30),
    scanWindow(admin, w7start, w7end, 7),
  ]);

  const summary = {
    ok: true,
    date: isoDateString(today),
    thirtyDay: result30,
    sevenDay: result7,
  };

  log.info('cron.renewals.complete', summary);
  return NextResponse.json(summary);
}
