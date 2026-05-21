import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Banner } from '@/app/components/ui';

/**
 * Pending request status banner — Statement Phase 3.
 *
 * Surfaced on the client home when the insured has an in-flight cert
 * request. Tells them where it is in the pipeline (pending review,
 * reviewed and waiting on Brook, etc.) without making them hunt for it.
 *
 * If there are zero in-flight requests, this renders nothing — silence
 * is the default state.
 */

export type PendingRequest = {
  id: string;
  certNumber: string;
  holderName: string;
  status: 'pending' | 'reviewed';
  requestedAt: string;
};

const STATUS_LABEL: Record<PendingRequest['status'], { title: string; body: string; tone: 'info' | 'success' }> = {
  pending: {
    title: 'Request submitted',
    body: 'Your certificate is in the queue. Brook will review it shortly.',
    tone: 'info',
  },
  reviewed: {
    title: 'Almost there',
    body: "The reviewer agent has checked it. Brook's final approve will release the PDF.",
    tone: 'success',
  },
};

export function PendingRequestBanner({ requests }: { requests: PendingRequest[] }) {
  if (requests.length === 0) return null;

  // If multiple are in flight, show the oldest with a count.
  const oldest = requests[0]!;
  const config = STATUS_LABEL[oldest.status];
  const more = requests.length - 1;

  return (
    <div className="mb-8 sm:mb-10">
      <Banner
        tone={config.tone}
        icon={<Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        title={config.title}
        actions={
          <Link
            href={`/status/${encodeURIComponent(oldest.certNumber)}`}
            className="focus-ring caps inline-flex items-center gap-1 rounded text-[0.62rem] font-semibold tracking-caps text-brand transition-colors hover:text-brand-deep"
          >
            Track
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        }
      >
        <span>{config.body}</span>
        <span className="mt-1 block font-mono text-[0.72rem] text-ink-faint">
          {oldest.certNumber} · for {oldest.holderName} · submitted {relative(oldest.requestedAt)}
        </span>
        {more > 0 && (
          <span className="caps mt-2 inline-block text-[0.6rem] font-semibold text-ink-faint">
            {more} more in flight
          </span>
        )}
      </Banner>
    </div>
  );
}

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
