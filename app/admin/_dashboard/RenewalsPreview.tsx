import Link from 'next/link';

export type RenewalRow = {
  id: string;
  type: string;
  policy_number: string;
  exp_date: string;
  client_id: string;
  business_name: string;
  insurer_name: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  GL: 'General Liability',
  WC: "Workers' Compensation",
  AUTO: 'Commercial Auto',
  UMBRELLA: 'Umbrella / Excess',
  EQUIPMENT: 'Contractors Equipment',
  OTHER: 'Other Coverage',
};

export function RenewalsPreview({ rows }: { rows: RenewalRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-md border border-dashed border-hairline bg-paper-deep/40 px-4 py-6 text-center">
        <p className="text-[0.85rem] text-ink-muted">No policies expiring in 30 days.</p>
      </div>
    );
  }

  const today = new Date();
  return (
    <ul className="mt-3 divide-y divide-hairline">
      {rows.map((r) => {
        const exp = new Date(r.exp_date);
        const days = Math.max(0, Math.ceil((exp.getTime() - today.getTime()) / 86_400_000));
        return (
          <li key={r.id} className="py-2.5">
            <Link
              href={`/admin/clients/${r.client_id}?tab=policies`}
              className="focus-ring -mx-1 flex items-center justify-between gap-3 rounded px-1 hover:text-ink"
            >
              <div className="min-w-0">
                <span className="text-[0.875rem] text-ink">
                  <span className="font-medium">{r.business_name}</span>
                  <span className="text-ink-faint"> · {TYPE_LABEL[r.type] ?? r.type}</span>
                </span>
                {r.insurer_name && (
                  <span className="caps ml-2 text-[0.6rem] font-semibold text-ink-faint">
                    {r.insurer_name}
                  </span>
                )}
              </div>
              <span className="num-tabular shrink-0 font-mono text-[0.72rem] text-ink-faint">
                {formatExp(exp)} · <span className={days <= 14 ? 'text-warning' : ''}>{days}d</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function formatExp(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
