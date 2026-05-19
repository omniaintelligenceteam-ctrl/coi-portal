import type { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/app/components/Logo';
import { verifyChecksum } from '@/lib/issueCert';

// Intentionally public — no auth. Only exposes non-sensitive cert metadata.
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ certNumber: string }> };

type VerifyRow = {
  cert_number: string;
  status: string;
  holder_name: string;
  holder_address1: string;
  holder_address2: string | null;
  requested_at: string;
  sent_at: string | null;
  coverages_selected: string[];
  client: { business_name: string } | null;
  agency: { name: string; phone: string | null; email: string | null } | null;
};

type PolicyRow = {
  type: string;
  eff_date: string;
  exp_date: string;
  active: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * OG / Twitter unfurl metadata. Runs on the server before the page renders.
 * We fetch only the bare minimum (cert_number, client business_name, the
 * latest expiry date) so a Slack/email preview always shows the right cert.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { certNumber } = await params;
  const admin = createAdminClient();

  const { data: cert } = await admin
    .from('cert_requests')
    .select(
      `cert_number, coverages_selected,
       client:coi_clients ( business_name )`,
    )
    .eq('cert_number', certNumber)
    .eq('status', 'sent')
    .maybeSingle<{
      cert_number: string;
      coverages_selected: string[];
      client: { business_name: string } | null;
    }>();

  const title = cert ? `Certificate ${cert.cert_number}` : `Certificate ${certNumber}`;

  let description = 'Verify the issuance status of a Policy Place certificate of insurance.';
  if (cert) {
    const insured = cert.client?.business_name ?? 'Insured';
    let expiryStr = '';
    if (cert.coverages_selected?.length) {
      const { data: policies } = await admin
        .from('policies')
        .select('exp_date')
        .in('id', cert.coverages_selected)
        .returns<{ exp_date: string }[]>();
      const expiries = (policies ?? []).map((p) => p.exp_date).sort();
      const earliest = expiries[0];
      if (earliest) {
        expiryStr = ` — covered through ${formatDate(earliest)}`;
      }
    }
    description = `${insured}${expiryStr}`;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Policy Place',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

export default async function VerifyPage({ params }: PageProps) {
  const { certNumber } = await params;

  // Tamper-evident gate — short-circuit before touching the DB so a forged
  // suffix never even hits Supabase.
  if (!verifyChecksum(certNumber)) {
    return <ForgedCert certNumber={certNumber} />;
  }

  const admin = createAdminClient();

  const { data: cert } = await admin
    .from('cert_requests')
    .select(
      `cert_number, status, holder_name, holder_address1, holder_address2,
       requested_at, sent_at, coverages_selected,
       client:coi_clients ( business_name ),
       agency:agencies ( name, phone, email )`,
    )
    .eq('cert_number', certNumber)
    .eq('status', 'sent')
    .maybeSingle<VerifyRow>();

  if (!cert) {
    return <InvalidCert certNumber={certNumber} />;
  }

  const { data: policies } = cert.coverages_selected.length
    ? await admin
        .from('policies')
        .select('type, eff_date, exp_date, active')
        .in('id', cert.coverages_selected)
        .returns<PolicyRow[]>()
    : { data: [] as PolicyRow[] };

  const today = new Date().toISOString().slice(0, 10);
  // Strict `>` — a policy expiring today is no longer active for verification purposes.
  // Insurance convention: coverage ends at 12:01 AM on the exp_date.
  const allActive = (policies ?? []).every((p) => p.active && p.exp_date > today);
  const earliestExpiry = (policies ?? [])
    .map((p) => p.exp_date)
    .sort()[0];
  const isExpired = !allActive && Boolean(earliestExpiry);

  const validatedAt = new Date();
  const validatedAtFull = validatedAt.toLocaleString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-paper px-6 py-16 sm:px-10">
      {/* When any covered policy has lapsed, drain the page of colour so a
          verifier reading on a phone instantly clocks that the cert is no
          longer current. The status banner stays full-colour for legibility. */}
      <div className={`mx-auto max-w-xl ${isExpired ? 'opacity-90 [&_*:not(.expired-banner)]:grayscale' : ''}`}>
        {/* Agency header — branded card. DB values win when present, else fall
            back to The Policy Place defaults so external verifiers always see
            a trust-establishing block. */}
        <div className="mb-12 border border-hairline bg-card px-5 py-5 sm:px-7 sm:py-6">
          <div className="flex items-start justify-between gap-4">
            <Logo tone="dark" compact />
            <div className="text-right">
              <p className="font-display text-[0.95rem] font-semibold tracking-tight text-ink">
                {cert.agency?.name ?? 'The Policy Place'}
              </p>
              <p className="caps mt-0.5 text-[0.58rem] font-semibold text-seal-deep">
                Brook Gaudy · Licensed Agent
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-hairline pt-4 font-mono text-[0.72rem] text-ink-muted">
            <span>908 Poplar St · Benton, KY 42025</span>
            <a
              href={`tel:+1${(cert.agency?.phone ?? '2704102015').replace(/\D/g, '')}`}
              className="hover:text-ink"
            >
              {cert.agency?.phone ?? '(270) 410-2015'}
            </a>
            <a
              href={`mailto:${cert.agency?.email ?? 'brook@yourpolicyplace.com'}`}
              className="hover:text-ink"
            >
              {cert.agency?.email ?? 'brook@yourpolicyplace.com'}
            </a>
          </div>
        </div>

        {/* Status banner — kept colour even in the expired (grayscale) state
            so the verdict is never ambiguous. */}
        <div
          className={`expired-banner mb-10 flex items-center gap-3 border px-5 py-4 ${
            allActive
              ? 'border-success/30 bg-success-soft/40'
              : 'border-danger/30 bg-danger-soft/40'
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full ${allActive ? 'bg-success' : 'bg-danger'}`}
          />
          <div>
            <p
              className={`caps text-[0.65rem] font-semibold ${
                allActive ? 'text-success' : 'text-danger'
              }`}
            >
              {allActive
                ? 'Certificate verified — coverage active'
                : earliestExpiry
                ? `Expired on ${formatDate(earliestExpiry)}`
                : 'One or more policies have expired'}
            </p>
            <p className="mt-0.5 text-[0.78rem] text-ink-muted">
              Last validated {validatedAtFull}
            </p>
          </div>
        </div>

        {/* Cert identity */}
        <div className="mb-8">
          <p className="caps text-[0.6rem] font-medium text-ink-faint">Certificate number</p>
          <p className="mt-1 font-mono text-lg font-medium text-ink">{cert.cert_number}</p>
        </div>

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <p className="caps text-[0.6rem] font-medium text-ink-faint">Insured</p>
            <p className="mt-1 font-medium text-ink">
              {cert.client?.business_name ?? '—'}
            </p>
          </div>
          <div>
            <p className="caps text-[0.6rem] font-medium text-ink-faint">Certificate holder</p>
            <p className="mt-1 font-medium text-ink">{cert.holder_name}</p>
            <p className="mt-0.5 font-mono text-[0.78rem] text-ink-muted">
              {cert.holder_address1}
              {cert.holder_address2 ? `, ${cert.holder_address2}` : ''}
            </p>
          </div>
        </div>

        {/* Coverages */}
        <div className="mt-10 border-t border-hairline pt-8">
          <p className="caps mb-4 text-[0.6rem] font-medium text-ink-faint">Coverages on certificate</p>
          <ul className="divide-y divide-hairline">
            {(policies ?? []).map((p, i) => {
              const expired = p.exp_date <= today;
              return (
                <li key={i} className="py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-[0.9rem] text-ink">
                    {TYPE_LABEL[p.type] ?? p.type}
                  </span>
                  <span
                    className={`font-mono text-[0.75rem] ${
                      expired ? 'text-danger' : 'text-ink-muted'
                    }`}
                  >
                    {formatDate(p.eff_date)} – {formatDate(p.exp_date)}
                    {expired && ' · EXPIRED'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Issue info */}
        <div className="mt-10 border-t border-hairline pt-8 text-[0.78rem] text-ink-muted">
          <p>
            Issued by{' '}
            <span className="font-medium text-ink">{cert.agency?.name ?? 'The Policy Place'}</span>
            {cert.agency?.email && (
              <> · <a href={`mailto:${cert.agency.email}`} className="underline-offset-2 hover:underline">{cert.agency.email}</a></>
            )}
          </p>
          {cert.sent_at && (
            <p className="mt-1">
              Certificate sent {formatLongDate(cert.sent_at)}
            </p>
          )}
        </div>

        <p className="mt-12 text-[0.7rem] text-ink-faint">
          This page verifies the issuance status of the referenced certificate. Confirm coverage
          limits and endorsements on the certificate document itself. For questions, contact the
          issuing agency directly.
        </p>
      </div>
    </div>
  );
}

function InvalidCert({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-danger/30 bg-danger-soft/40">
          <span className="h-4 w-4 rounded-full bg-danger" />
        </div>
        <p className="caps text-[0.65rem] font-semibold text-danger">Certificate not found</p>
        <h1 className="font-display mt-3 text-2xl font-medium text-ink">
          We couldn't verify this certificate.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          Certificate <span className="font-mono text-ink">{certNumber}</span> was not found in
          our records, or has not yet been issued.
          <br /><br />
          If you received this certificate recently, try again in a few minutes. Otherwise, contact
          the issuing agency to confirm.
        </p>
      </div>
    </div>
  );
}

function ForgedCert({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border-2 border-danger/50 bg-danger-soft/60">
          <span className="h-4 w-4 rounded-full bg-danger" />
        </div>
        <p className="caps text-[0.65rem] font-semibold text-danger">Checksum failed</p>
        <h1 className="font-display mt-3 text-2xl font-medium text-ink">
          Forged or mistyped certificate number.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">
          The certificate number{' '}
          <span className="font-mono text-ink">{certNumber}</span> doesn't pass our
          tamper-evident check. Double-check the trailing characters against the
          original PDF — or, if it looks intentional, ask the sender to forward
          the original email.
        </p>
        <p className="mt-6 text-[0.7rem] text-ink-faint">
          Every Policy Place certificate ends with a three-character verification suffix.
        </p>
      </div>
    </div>
  );
}
