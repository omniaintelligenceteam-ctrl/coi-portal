import Link from 'next/link';
import { StaticChip } from '@/app/components/ui';

export type QueuePreviewRow = {
  id: string;
  cert_number: string;
  status: string;
  holder_name: string;
  requested_at: string;
  business_name: string;
};

const STATUS_TONE: Record<string, 'brand' | 'warning' | 'default'> = {
  reviewed: 'brand',
  pending: 'warning',
};

/**
 * Compact preview of today's queue — used on the admin home bento.
 * Five rows max, each links into the full cert detail.
 */
export function QueuePreview({ rows }: { rows: QueuePreviewRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-dashed border-hairline bg-paper-deep/40 px-4 py-8 text-center">
        <p className="caps text-[0.62rem] font-semibold text-ink-faint">Queue clear</p>
        <p className="mt-1 text-[0.85rem] text-ink-muted">
          Nothing waiting. New requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => {
        const initials = r.business_name
          .split(' ')
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() ?? '')
          .join('');
        return (
          <li key={r.id}>
            <Link
              href={`/admin/queue/${r.id}`}
              className="focus-ring -mx-1 grid grid-cols-[32px_1fr_auto] items-center gap-3 rounded-md border border-hairline bg-card px-3 py-2.5 transition-colors hover:border-ink/40"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-[0.7rem] font-semibold text-brand">
                {initials || '—'}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[0.9rem] font-medium text-ink">
                  {r.business_name}
                </span>
                <span className="block truncate font-mono text-[0.72rem] text-ink-faint">
                  {formatTime(r.requested_at)} · for {r.holder_name}
                </span>
              </span>
              <StaticChip tone={STATUS_TONE[r.status] ?? 'default'}>{r.status}</StaticChip>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}
