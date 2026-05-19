'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS: { label: string; href: string; match: (path: string) => boolean }[] = [
  {
    label: 'Admin',
    href: '/admin/queue',
    match: (p) =>
      p.startsWith('/admin/queue') ||
      p.startsWith('/admin/import-policy') ||
      p.startsWith('/admin/export'),
  },
  {
    label: 'Generate',
    href: '/admin/generate',
    match: (p) => p.startsWith('/admin/generate'),
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    match: (p) => p.startsWith('/admin/settings'),
  },
];

export function AdminTabs() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Admin sections"
      className="border-b border-hairline bg-paper/70 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-6 sm:px-10 lg:px-16 xl:px-24">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'focus-ring caps tap-target relative -mb-px inline-flex shrink-0 items-center px-3 py-4 text-[0.7rem] font-semibold tracking-[0.18em] transition-colors sm:py-3 sm:text-[0.62rem]',
                active
                  ? 'text-ink'
                  : 'text-ink-faint hover:text-ink-muted',
              ].join(' ')}
            >
              {t.label}
              <span
                aria-hidden="true"
                className={[
                  'pointer-events-none absolute inset-x-2 -bottom-px h-0.5 transition-colors',
                  active ? 'bg-seal' : 'bg-transparent',
                ].join(' ')}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
