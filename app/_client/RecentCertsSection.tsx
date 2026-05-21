import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';
import { Hairline } from '@/app/components/Hairline';

/**
 * Recent certificates section — Statement Phase 3 client surface.
 *
 * Surfaced ABOVE the request form on the client home so the dominant case
 * (re-send the same cert to a new holder) is one tap. Each card links to
 * the result page where the client can re-download or share.
 *
 * Mobile: stacked cards. Desktop: 3-column grid.
 *
 * Per-card affordance: tap "Reuse →" opens the request form pre-filled
 * with the same holder and coverages (future enhancement — for now it
 * just deep-links to the cert detail).
 */

export type RecentCert = {
  certNumber: string;
  holderName: string;
  sentAt: string | null;
};

export function RecentCertsSection({ certs }: { certs: RecentCert[] }) {
  if (certs.length === 0) return null;

  return (
    <section className="mb-10 sm:mb-14">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-brand" aria-hidden="true" />
          <p className="caps text-[0.65rem] font-semibold tracking-caps text-brand">
            Recent certificates
          </p>
        </div>
        <Link
          href="/certificates"
          className="focus-ring caps -m-1 inline-flex items-center gap-1 rounded p-1 text-[0.62rem] font-semibold tracking-caps text-brand-deep transition-colors hover:text-brand"
        >
          See all
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
      <Hairline className="mb-5" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {certs.map((c) => (
          <Link
            key={c.certNumber}
            href={`/result/${encodeURIComponent(c.certNumber)}`}
            className="focus-ring group block rounded-[var(--r-md)] border border-hairline bg-card p-4 transition-colors hover:border-hairline-strong"
          >
            <p className="num-tabular font-mono text-[0.72rem] font-medium text-ink-faint">
              {c.certNumber}
            </p>
            <p className="mt-2 truncate text-[0.95rem] font-medium leading-[1.3] text-ink">
              {c.holderName}
            </p>
            {c.sentAt && (
              <p className="mt-1 text-[0.78rem] text-ink-muted">{relativeTime(c.sentAt)}</p>
            )}
            <p className="caps mt-3 inline-flex items-center gap-1 text-[0.6rem] font-semibold tracking-caps text-brand transition-colors group-hover:text-brand-deep">
              View
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
