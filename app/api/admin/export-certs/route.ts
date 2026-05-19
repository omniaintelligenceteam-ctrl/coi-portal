/**
 * Compliance audit CSV export. Admin-only.
 * GET /api/admin/export-certs?holderName=&dateFrom=&dateTo=&status=
 * Returns: text/csv attachment.
 */

import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function csvEscape(val: string | null | undefined): string {
  if (val == null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type ExportRow = {
  cert_number: string;
  status: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  requested_at: string;
  sent_at: string | null;
  decided_by_email: string | null;
  client: { business_name: string } | null;
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const holderName = params.get('holderName')?.trim() ?? '';
  const dateFrom = params.get('dateFrom') ?? '';
  const dateTo = params.get('dateTo') ?? '';
  const status = params.get('status') ?? '';

  const admin = createAdminClient();
  let query = admin
    .from('cert_requests')
    .select(
      `cert_number, status, holder_name, holder_address1, holder_address2,
       requested_at, sent_at, decided_by_email,
       client:coi_clients ( business_name )`,
    );

  if (holderName) query = query.ilike('holder_name', `%${holderName}%`);
  if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('requested_at', dateFrom);
  if (dateTo) query = query.lte('requested_at', `${dateTo}T23:59:59Z`);

  const { data: rows, error } = await query
    .order('requested_at', { ascending: false })
    .limit(5000)
    .returns<ExportRow[]>();
  if (error) {
    log.error('export.fetch_failed', { error: error.message });
    return new Response('Export failed', { status: 500 });
  }

  const HEADERS = [
    'Certificate Number',
    'Status',
    'Insured',
    'Holder Name',
    'Holder Address 1',
    'Holder Address 2',
    'Requested',
    'Sent',
    'Decided By',
  ];

  const lines = [
    HEADERS.join(','),
    ...(rows ?? []).map((r) =>
      [
        csvEscape(r.cert_number),
        csvEscape(r.status),
        csvEscape(r.client?.business_name),
        csvEscape(r.holder_name),
        csvEscape(r.holder_address1),
        csvEscape(r.holder_address2),
        csvEscape(formatDate(r.requested_at)),
        csvEscape(formatDate(r.sent_at)),
        csvEscape(r.decided_by_email),
      ].join(','),
    ),
  ];

  const csv = lines.join('\r\n');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `COI-Export-${date}.csv`;

  log.info('export.complete', { rows: (rows ?? []).length, filename });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
