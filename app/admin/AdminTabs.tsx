'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type TabVariant = 'tab' | 'pill-outline' | 'pill-filled';

const TABS: {
  label: string;
  href: string;
  match: (path: string) => boolean;
  variant: TabVariant;
}[] = [
  {
    label: 'Admin',
    href: '/admin/queue',
    match: (p) =>
      p.startsWith('/admin/queue') ||
      p.startsWith('/admin/import-policy') ||
      p.startsWith('/admin/export'),
    variant: 'pill-outline',
  },
  {
    label: 'Generate',
    href: '/admin/generate',
    match: (p) => p.startsWith('/admin/generate'),
    variant: 'pill-filled',
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    match: (p) => p.startsWith('/admin/settings'),
    variant: 'pill-outline',
  },
];

export function AdminTabs() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Admin sections"
      className="border-b border-hairline bg-paper/70 backdrop-blur-sm"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-2 overflow-x-auto px-6 sm:px-10 lg:px-16 xl:px-24">
        {TABS.map((t) => {
          const active = t.match(pathname);

          if (t.variant === 'tab') {
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'focus-ring caps tap-target relative -mb-px inline-flex shrink-0 items-center px-3 py-4 text-[0.7rem] font-semibold tracking-[0.18em] transition-colors sm:py-3 sm:text-[0.62rem]',
                  active ? 'text-ink' : 'text-ink-faint hover:text-ink-muted',
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
          }

          if (t.variant === 'pill-outline') {
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'focus-ring caps tap-target inline-flex shrink-0 items-center rounded-full border px-4 py-2 text-[0.7rem] font-semibold tracking-[0.18em] transition-colors sm:text-[0.62rem]',
                  active
                    ? 'border-brand bg-brand-soft text-brand-deep'
                    : 'border-brand/40 bg-transparent text-brand-deep hover:border-brand hover:bg-brand-soft',
                ].join(' ')}
              >
                {t.label}
              </Link>
            );
          }

          // pill-filled — primary CTA with soft glow halo (mirrors the sign-in nav's Signup button).
          return (
            <div key={t.href} className="relative group shrink-0">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -m-2 hidden rounded-full bg-brand opacity-40 blur-lg transition-all duration-300 ease-out group-hover:-m-3 group-hover:opacity-60 group-hover:blur-xl sm:block"
              />
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'focus-ring caps tap-target relative z-10 inline-flex items-center rounded-full px-4 py-2 text-[0.7rem] font-semibold tracking-[0.18em] text-white transition-all duration-200 sm:text-[0.62rem]',
                  active
                    ? 'bg-linear-to-br from-brand-deep to-brand-near hover:from-brand-near hover:to-brand-deep'
                    : 'bg-linear-to-br from-brand to-brand-deep hover:from-brand-deep hover:to-brand-near',
                ].join(' ')}
              >
                {t.label}
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
