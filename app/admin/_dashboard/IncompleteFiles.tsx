import Link from 'next/link';
import { ArrowRight, AlertTriangle } from 'lucide-react';

export type IncompleteFileRow = {
  clientId: string;
  businessName: string;
  score: number;
  missingCount: number;
};

/**
 * "Files needing attention" — bento card for the admin home.
 *
 * Lists the clients whose master file completeness score sits below 100%.
 * Sorted lowest-first because those need Brook's time most. Top 5 shown
 * inline; full list lives on /admin/clients with a filter.
 */
export function IncompleteFiles({ rows }: { rows: IncompleteFileRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-hairline bg-paper-deep/40 px-4 py-6 text-center">
        <p className="text-[0.85rem] text-ink-muted">
          All client master files are complete. Nothing for the AI to guess at.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-hairline">
      {rows.slice(0, 5).map((r) => (
        <li key={r.clientId} className="py-2.5">
          <Link
            href={`/admin/clients/${r.clientId}?tab=master`}
            className="focus-ring -mx-1 flex items-center justify-between gap-3 rounded px-1 transition-colors hover:text-ink"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <ScoreRing score={r.score} />
              <div className="min-w-0">
                <p className="truncate text-[0.875rem] font-medium text-ink">
                  {r.businessName}
                </p>
                <p className="text-[0.72rem] text-ink-faint">
                  {r.missingCount} missing field{r.missingCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <ArrowRight
              className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ScoreRing({ score }: { score: number }) {
  const dash = (score / 100) * 100;
  const color = score >= 80 ? 'var(--color-warning)' : 'var(--color-danger)';
  return (
    <svg viewBox="0 0 36 36" className="h-8 w-8 shrink-0 -rotate-90" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke="var(--color-hairline)"
        strokeWidth="4"
      />
      <circle
        cx="18"
        cy="18"
        r="15.9155"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} 100`}
        strokeLinecap="round"
      />
    </svg>
  );
}
