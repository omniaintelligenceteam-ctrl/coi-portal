'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { RosterRow } from './page';

export function ClientRoster({ rows }: { rows: RosterRow[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.businessName.toLowerCase().includes(q) ||
        (r.contactEmail ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <>
      <div className="mb-6">
        <label htmlFor="roster-search" className="caps block text-[0.6rem] font-semibold text-ink-faint">
          Search
        </label>
        <input
          id="roster-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Business name or email"
          className="field-underline mt-2 block w-full text-base text-ink"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="border border-hairline bg-card px-5 py-8 text-sm text-ink-muted">
          No matches.
        </p>
      ) : (
        <div className="overflow-x-auto border-y border-hairline">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-hairline">
                <Th>Business</Th>
                <Th>Contact</Th>
                <Th align="right">Active policies</Th>
                <Th align="right">Last issued</Th>
                <Th align="right">Mode</Th>
                <Th align="right">{''}</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-b-0">
                  <Td>
                    <Link
                      href={`/admin/generate/${r.id}`}
                      className="focus-ring rounded font-medium text-[0.92rem] text-ink underline-offset-4 hover:underline"
                    >
                      {r.businessName}
                    </Link>
                    {!r.active && (
                      <span className="caps ml-2 inline-flex items-center rounded-full bg-paper-deep px-2 py-0.5 text-[0.55rem] font-semibold text-ink-faint">
                        Inactive
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="font-mono text-[0.78rem] text-ink-muted">
                      {r.contactEmail ?? '—'}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.85rem] text-ink">{r.activePolicies}</span>
                  </Td>
                  <Td align="right">
                    <span className="font-mono text-[0.78rem] text-ink-muted">
                      {r.lastIssuedAt ? formatTimestamp(r.lastIssuedAt) : '—'}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className={
                        r.autoApprove
                          ? 'caps inline-flex items-center rounded-full border border-seal/40 bg-seal-soft px-2 py-0.5 text-[0.55rem] font-semibold text-seal-deep'
                          : 'caps inline-flex items-center rounded-full border border-hairline-strong bg-white px-2 py-0.5 text-[0.55rem] font-semibold text-ink-faint'
                      }
                    >
                      {r.autoApprove ? 'Auto' : 'Manual'}
                    </span>
                  </Td>
                  <Td align="right">
                    <Link
                      href={`/admin/settings/clients/${r.id}/overrides`}
                      className="focus-ring caps inline-flex items-center rounded px-2 py-1 text-[0.6rem] font-semibold text-brand underline-offset-4 hover:underline"
                    >
                      Overrides
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="caps mt-5 text-[0.6rem] font-medium text-ink-faint">
        {filtered.length} of {rows.length} shown
      </p>
    </>
  );
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function Th({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={`caps px-3 py-3 text-[0.6rem] font-semibold text-ink-faint ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-3 py-4 align-middle ${align === 'right' ? 'text-right' : ''}`}>{children}</td>
  );
}
