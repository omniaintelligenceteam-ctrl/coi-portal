/**
 * Admin home — Statement Phase 2a.
 *
 * Before Statement, /admin had no page.tsx and the Header logo redirected
 * to /admin/queue — Brook's home was the queue. Statement reframes this:
 * a real dashboard at /admin shows what needs attention today. The queue is
 * still one tap away (sidebar) but it's no longer the front door.
 *
 * Layout: pending + approved-this-week stat cards across the top, today's
 * queue takes the right column (spans 2 rows), renewals due across the
 * bottom-left (wide), 30-day activity sparkline tucked into the renewals
 * card footer.
 *
 * All data fetched server-side via the admin client. The layout's email
 * gate has already authenticated us; this page just renders.
 */

import { redirect } from 'next/navigation';
import { ArrowRight, FilePlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button, ButtonLink, PageShell } from '@/app/components/ui';
import { BentoCard } from './_dashboard/BentoCard';
import { StatNumber } from './_dashboard/StatNumber';
import { QueuePreview, type QueuePreviewRow } from './_dashboard/QueuePreview';
import { RenewalsPreview, type RenewalRow } from './_dashboard/RenewalsPreview';
import { ActivitySpark } from './_dashboard/ActivitySpark';
import { IncompleteFiles, type IncompleteFileRow } from './_dashboard/IncompleteFiles';
import { scoreMasterFile } from '@/lib/masterFileCompleteness';

export const dynamic = 'force-dynamic';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function startOfWeek(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

type CertRequestRow = {
  id: string;
  cert_number: string;
  status: string;
  holder_name: string;
  requested_at: string;
  client: { business_name: string } | null;
};

type PolicyRow = {
  id: string;
  type: string;
  policy_number: string;
  exp_date: string;
  client_id: string;
  client: { business_name: string } | null;
  insurer: { name: string | null } | null;
};

type AgencyRow = { contact_name: string | null };

type ClientForScoring = {
  id: string;
  business_name: string;
  business_address1: string | null;
  contact_email: string;
  contact_name: string | null;
  phone: string | null;
  default_description: string | null;
};

type PolicyForScoring = {
  id: string;
  client_id: string;
  type: 'GL' | 'WC' | 'AUTO' | 'UMBRELLA' | 'EQUIPMENT' | 'OTHER';
  policy_number: string | null;
  eff_date: string | null;
  exp_date: string | null;
  status: 'active' | 'cancelled' | 'expired';
  active: boolean;
  limits_jsonb: Record<string, number> | null;
  insurer: { name: string; naic: string } | null;
};

export default async function AdminHomePage() {
  // Defensive auth check — the layout already gates by email, but server
  // components can be cached so we re-verify cheaply here.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const now = new Date();
  const weekStart = startOfWeek();
  const thirtyAgo = daysAgo(29); // 30 days inclusive
  const thirtyForward = new Date(Date.now() + 30 * 86_400_000);

  // Parallel data fetches.
  const [
    { count: pendingCount },
    { count: approvedThisWeekCount },
    { data: queueRows },
    { data: renewalRows },
    { data: activityRows },
    { data: agencyRow },
    incompleteFiles,
  ] = await Promise.all([
    admin
      .from('cert_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'reviewed']),
    admin
      .from('cert_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['approved', 'edited', 'sent'])
      .gte('decided_at', weekStart.toISOString()),
    admin
      .from('cert_requests')
      .select(
        `id, cert_number, status, holder_name, requested_at,
         client:coi_clients ( business_name )`,
      )
      .in('status', ['pending', 'reviewed'])
      .order('requested_at', { ascending: true })
      .limit(5)
      .returns<CertRequestRow[]>(),
    admin
      .from('policies')
      .select(
        `id, type, policy_number, exp_date, client_id,
         client:coi_clients ( business_name ),
         insurer:insurers ( name )`,
      )
      .eq('status', 'active')
      .lte('exp_date', thirtyForward.toISOString().slice(0, 10))
      .gte('exp_date', now.toISOString().slice(0, 10))
      .order('exp_date', { ascending: true })
      .limit(5)
      .returns<PolicyRow[]>(),
    admin
      .from('cert_requests')
      .select('sent_at')
      .gte('sent_at', thirtyAgo.toISOString())
      .order('sent_at', { ascending: true }),
    process.env.BRAND_AGENCY_ID
      ? admin
          .from('agencies')
          .select('contact_name')
          .eq('id', process.env.BRAND_AGENCY_ID)
          .maybeSingle<AgencyRow>()
      : Promise.resolve({ data: null as AgencyRow | null }),
    // Master file completeness scan — defensive: if the new columns aren't
    // there yet (migration pending), gracefully return zero rows so the
    // dashboard bento just renders empty rather than 500-ing.
    loadIncompleteFiles(admin),
  ]);

  // Transform to view-model shapes the preview components want.
  const queueView: QueuePreviewRow[] = (queueRows ?? []).map((r) => ({
    id: r.id,
    cert_number: r.cert_number,
    status: r.status,
    holder_name: r.holder_name,
    requested_at: r.requested_at,
    business_name: r.client?.business_name ?? '—',
  }));

  const renewalsView: RenewalRow[] = (renewalRows ?? []).map((r) => ({
    id: r.id,
    type: r.type,
    policy_number: r.policy_number,
    exp_date: r.exp_date,
    client_id: r.client_id,
    business_name: r.client?.business_name ?? '—',
    insurer_name: r.insurer?.name ?? null,
  }));

  // Bucket sent_at timestamps into daily counts (oldest first, length 30).
  const daily = bucketDaily((activityRows ?? []).map((r) => r.sent_at as string | null), 30);

  const greetingName = agencyRow?.contact_name?.split(' ')[0] ?? firstName(email);
  const oldestPendingMinutes = queueView.length
    ? Math.floor((Date.now() - new Date(queueView[0]!.requested_at).getTime()) / 60_000)
    : 0;

  return (
    <PageShell as="main" className="page-pad-top page-pad-bot">
      {/* Headline */}
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-[400] leading-[1.05] tracking-display text-ink">
            Welcome back, <span className="text-brand">{greetingName}</span>.
          </h1>
          <p className="mt-2 text-[0.95rem] text-ink-muted">
            {formatToday()} · {pendingCount ?? 0} cert{pendingCount === 1 ? '' : 's'} need your eyes.
          </p>
        </div>
        <ButtonLink href="/admin/generate" leadingIcon={<FilePlus className="h-4 w-4" />}>
          New cert
        </ButtonLink>
      </header>

      {/* Bento */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-[auto_auto]">
        {/* Pending */}
        <BentoCard
          label="Pending review"
          delta={
            (pendingCount ?? 0) > 0
              ? { value: `oldest ${oldestPendingMinutes}m`, tone: 'neutral' }
              : { value: 'clear', tone: 'success' }
          }
          href="/admin/queue"
        >
          <StatNumber value={pendingCount ?? 0} />
        </BentoCard>

        {/* Approved this week */}
        <BentoCard
          label="Approved this week"
          delta={
            (approvedThisWeekCount ?? 0) > 0
              ? { value: 'this week', tone: 'success' }
              : undefined
          }
        >
          <StatNumber value={approvedThisWeekCount ?? 0} />
        </BentoCard>

        {/* Queue preview — tall right column */}
        <BentoCard label="Today's queue" tall className="md:row-span-2">
          <QueuePreview rows={queueView} />
          {queueView.length > 0 && (
            <a
              href="/admin/queue"
              className="focus-ring caps mt-4 inline-flex items-center gap-1 text-[0.62rem] font-semibold text-brand hover:text-brand-deep"
            >
              View all
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </BentoCard>

        {/* Renewals — wide bottom-left */}
        <BentoCard
          label="Renewals due · next 30 days"
          delta={
            (renewalsView.length ?? 0) > 0
              ? { value: `${renewalsView.length} to call`, tone: 'neutral' }
              : undefined
          }
          wide
          className="md:col-span-2"
        >
          <RenewalsPreview rows={renewalsView} />
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="caps mb-1 text-[0.6rem] font-semibold text-ink-faint">
              30-day activity
            </p>
            <ActivitySpark daily={daily} />
          </div>
        </BentoCard>

        {/* Files needing attention — full-width row below the bento */}
        <BentoCard
          label="Files needing attention"
          delta={
            (incompleteFiles?.length ?? 0) > 0
              ? { value: `${incompleteFiles.length} incomplete`, tone: 'neutral' }
              : { value: 'all complete', tone: 'success' }
          }
          full
        >
          <IncompleteFiles rows={incompleteFiles ?? []} />
        </BentoCard>
      </div>
    </PageShell>
  );
}

/* ---------- helpers ---------- */

/**
 * Pull every active client + their policies in two queries, score each
 * master file, return the most-incomplete N for the dashboard bento.
 *
 * Defensive: if the new default_description column isn't there yet, falls
 * back to selecting without it. The completeness scorer treats it as
 * missing, so the score will be a bit lower until the migration lands —
 * but the page still renders.
 */
async function loadIncompleteFiles(
  admin: ReturnType<typeof createAdminClient>,
): Promise<IncompleteFileRow[]> {
  // Try the full select first.
  const fullClients = await admin
    .from('coi_clients')
    .select(
      'id, business_name, business_address1, contact_email, contact_name, phone, default_description',
    )
    .eq('active', true)
    .is('archived_at', null)
    .limit(80)
    .returns<ClientForScoring[]>();

  let clients: ClientForScoring[] = fullClients.data ?? [];

  if (fullClients.error) {
    const legacy = await admin
      .from('coi_clients')
      .select(
        'id, business_name, business_address1, contact_email, contact_name, phone',
      )
      .eq('active', true)
      .is('archived_at', null)
      .limit(80);
    clients = (legacy.data ?? []).map((c) => ({
      ...(c as Omit<ClientForScoring, 'default_description'>),
      default_description: null,
    }));
  }

  if (clients.length === 0) return [];

  const ids = clients.map((c) => c.id);
  const { data: policies } = await admin
    .from('policies')
    .select(
      `id, client_id, type, policy_number, eff_date, exp_date,
       status, active, limits_jsonb,
       insurer:insurers ( name, naic )`,
    )
    .in('client_id', ids)
    .returns<PolicyForScoring[]>();

  const byClient = new Map<string, PolicyForScoring[]>();
  for (const p of policies ?? []) {
    const arr = byClient.get(p.client_id) ?? [];
    arr.push(p);
    byClient.set(p.client_id, arr);
  }

  const rows: IncompleteFileRow[] = clients
    .map((c) => {
      const ps = byClient.get(c.id) ?? [];
      const { score, missing } = scoreMasterFile(
        {
          business_name: c.business_name,
          business_address1: c.business_address1,
          contact_email: c.contact_email,
          contact_name: c.contact_name,
          phone: c.phone,
          default_description: c.default_description,
        },
        ps.map((p) => ({
          id: p.id,
          type: p.type,
          policy_number: p.policy_number,
          eff_date: p.eff_date,
          exp_date: p.exp_date,
          status: p.status,
          active: p.active,
          limits_jsonb: p.limits_jsonb,
          insurer: p.insurer,
        })),
      );
      return {
        clientId: c.id,
        businessName: c.business_name ?? '—',
        score,
        missingCount: missing.length,
      };
    })
    .filter((r) => r.score < 100)
    .sort((a, b) => a.score - b.score);

  return rows;
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function firstName(email: string): string {
  const local = email.split('@')[0] ?? 'there';
  return local.split(/[._]/)[0]!.replace(/^./, (c) => c.toUpperCase());
}

function bucketDaily(timestamps: (string | null)[], days: number): number[] {
  const buckets = new Array<number>(days).fill(0);
  const startMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime() - (days - 1) * 86_400_000;
  })();
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = new Date(ts).getTime();
    const idx = Math.floor((t - startMs) / 86_400_000);
    if (idx >= 0 && idx < days) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}
