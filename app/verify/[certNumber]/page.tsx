import type { Metadata } from 'next';
import { AlertOctagon, ShieldX } from 'lucide-react';
import { createAdminClient } from '@/lib/supabase/admin';
import { Logo } from '@/app/components/Logo';
import { SealStamp } from '@/app/components/motion';
import { Card } from '@/app/components/ui';
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
    <main className="mx-auto w-full max-w-5xl px-6 pb-20 pt-8 sm:px-10 sm:pb-24 sm:pt-12 lg:px-16 lg:pt-14 xl:px-24">
      <div
        className={`mx-auto max-w-2xl ${
          isExpired ? 'opacity-90 [&_*:not(.expired-banner)]:grayscale' : ''
        }`}
      >
        {/* Agency header */}
        <Card padding="md" className="mb-10 sm:mb-12">
          <div className="flex items-start justify-between gap-4">
            <Logo tone="dark" compact />
            <div className="text-right">
              <p className="font-display text-[0.95rem] font-semibold tracking-tight text-ink">
                {cert.agency?.name ?? 'The Policy Place'}
              </p>
              <p className="caps mt-0.5 text-[0.58rem] font-semibold tracking-[0.18em] text-seal-deep">
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
        </Card>

        {allActive && (
          <div className="mb-8 flex justify-center">
            <SealStamp size={96} tone="success" />
          </div>
        )}

        <div
          className={`expired-banner verify-data-in mb-10 flex items-center gap-3 rounded-[var(--r-md)] border px-5 py-4 shadow-card ${
            allActive
              ? 'border-success/35 bg-success-soft/50'
              : 'border-danger/35 bg-danger-soft/50'
          }`}
          style={{ animationDelay: allActive ? '200ms' : '0ms' }}
        >
          <span
            className={`h-3 w-3 shrink-0 rounded-full ${
              allActive ? 'bg-success' : 'bg-danger'
            }`}
            aria-hidden="true"
          />
          <div>
            <p
              className={`caps text-[0.7rem] font-semibold tracking-[0.18em] ${
                allActive ? 'text-success' : 'text-danger'
              }`}
            >
              {allActive
                ? 'Certificate verified — coverage active'
                : earliestExpiry
                ? `Expired on ${formatDate(earliestExpiry)}`
                : 'One or more policies have expired'}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-muted">
              Last validated {validatedAtFull}
            </p>
          </div>
        </div>

        <div
          className="verify-data-in mb-8"
          style={{ animationDelay: allActive ? '280ms' : '80ms' }}
        >
          <p className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
            Certificate number
          </p>
          <p className="num-tabular mt-1 font-mono text-[1.125rem] font-medium text-ink">
            {cert.cert_number}
          </p>
        </div>

        <div
          className="verify-data-in grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8"
          style={{ animationDelay: allActive ? '360ms' : '160ms' }}
        >
          <div>
            <p className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
              Insured
            </p>
            <p className="mt-1.5 font-display text-[1.1rem] font-medium leading-[1.25] text-ink">
              {cert.client?.business_name ?? '—'}
            </p>
          </div>
          <div>
            <p className="caps text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
              Certificate holder
            </p>
            <p className="mt-1.5 font-display text-[1.1rem] font-medium leading-[1.25] text-ink">
              {cert.holder_name}
            </p>
            <p className="mt-1 font-mono text-[0.78rem] leading-[1.55] text-ink-muted">
              {cert.holder_address1}
              {cert.holder_address2 ? `, ${cert.holder_address2}` : ''}
            </p>
          </div>
        </div>

        <div
          className="verify-data-in mt-10 border-t border-hairline pt-8"
          style={{ animationDelay: allActive ? '440ms' : '240ms' }}
        >
          <p className="caps mb-4 text-[0.6rem] font-medium tracking-[0.18em] text-ink-faint">
            Coverages on certificate
          </p>
          <ul className="divide-y divide-hairline">
            {(policies ?? []).map((p, i) => {
              const expired = p.exp_date <= today;
              return (
                <li
                  key={i}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="text-[0.9375rem] font-medium text-ink">
                    {TYPE_LABEL[p.type] ?? p.type}
                  </span>
                  <span
                    className={`font-mono text-[0.78rem] ${
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

        <div
          className="verify-data-in mt-10 border-t border-hairline pt-8 text-[0.8125rem] text-ink-muted"
          style={{ animationDelay: allActive ? '520ms' : '320ms' }}
        >
          <p>
            Issued by{' '}
            <span className="font-medium text-ink">
              {cert.agency?.name ?? 'The Policy Place'}
            </span>
            {cert.agency?.email && (
              <>
                {' '}
                ·{' '}
                <a
                  href={`mailto:${cert.agency.email}`}
                  className="underline-offset-2 hover:underline"
                >
                  {cert.agency.email}
                </a>
              </>
            )}
          </p>
          {cert.sent_at && <p className="mt-1">Certificate sent {formatLongDate(cert.sent_at)}</p>}
        </div>

        <p className="mt-10 text-[0.72rem] leading-[1.55] text-ink-faint">
          This page verifies the issuance status of the referenced certificate. Confirm coverage
          limits and endorsements on the certificate document itself. For questions, contact the
          issuing agency directly.
        </p>
      </div>
    </main>
  );
}

function InvalidCert({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-6">
      <Card padding="lg" className="max-w-md text-center" raised>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-danger/30 bg-danger-soft/40">
          <AlertOctagon className="h-7 w-7 text-danger" aria-hidden="true" />
        </div>
        <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-danger">
          Certificate not found
        </p>
        <h1 className="font-display mt-3 text-[1.5rem] font-medium leading-[1.2] text-ink sm:text-[1.75rem]">
          We couldn&apos;t verify this certificate.
        </h1>
        <p className="mt-4 text-[0.875rem] leading-[1.55] text-ink-muted">
          Certificate <span className="font-mono text-ink">{certNumber}</span> was not found in our
          records, or has not yet been issued.
          <br />
          <br />
          If you received this certificate recently, try again in a few minutes. Otherwise, contact
          the issuing agency to confirm.
        </p>
      </Card>
    </div>
  );
}

function ForgedCert({ certNumber }: { certNumber: string }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-paper px-6">
      <Card padding="lg" className="max-w-md text-center" raised>
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-danger/50 bg-danger-soft/60">
          <ShieldX className="h-7 w-7 text-danger" aria-hidden="true" />
        </div>
        <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-danger">
          Checksum failed
        </p>
        <h1 className="font-display mt-3 text-[1.5rem] font-medium leading-[1.2] text-ink sm:text-[1.75rem]">
          Forged or mistyped certificate number.
        </h1>
        <p className="mt-4 text-[0.875rem] leading-[1.55] text-ink-muted">
          The certificate number <span className="font-mono text-ink">{certNumber}</span>{' '}
          doesn&apos;t pass our tamper-evident check. Double-check the trailing characters against
          the original PDF — or, if it looks intentional, ask the sender to forward the original
          email.
        </p>
        <p className="mt-5 text-[0.72rem] text-ink-faint">
          Every Policy Place certificate ends with a three-character verification suffix.
        </p>
      </Card>
    </div>
  );
}
