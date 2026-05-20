'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Inbox, FilePlus, Users, UserPlus, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Admin section tabs — refined top nav with icon + label, active state shown
 * via gold seal underline. Hidden on mobile in favor of the Header drawer
 * (see Header.tsx); on mobile this nav becomes a horizontal-scroll strip so
 * the user always sees their current tab.
 *
 * Keep the route list in sync with the drawer in Header.tsx.
 */
type Tab = {
  label: string;
  href: string;
  match: (path: string) => boolean;
  icon: LucideIcon;
};

const TABS: Tab[] = [
  {
    label: 'Queue',
    href: '/admin/queue',
    match: (p) =>
      p.startsWith('/admin/queue') ||
      p.startsWith('/admin/import-policy') ||
      p.startsWith('/admin/export'),
    icon: Inbox,
  },
  {
    label: 'Generate',
    href: '/admin/generate',
    match: (p) => p.startsWith('/admin/generate'),
    icon: FilePlus,
  },
  {
    label: 'Clients',
    href: '/admin/clients',
    match: (p) => p.startsWith('/admin/clients'),
    icon: Users,
  },
  {
    label: 'Access',
    href: '/admin/access-requests',
    match: (p) => p.startsWith('/admin/access-requests'),
    icon: UserPlus,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    match: (p) => p.startsWith('/admin/settings'),
    icon: Settings,
  },
];

export function AdminTabs() {
  const pathname = usePathname() ?? '';
  return (
    <nav
      aria-label="Admin sections"
      className="sticky top-[3.5rem] z-20 border-b border-hairline bg-paper/85 backdrop-blur-md sm:top-[3.75rem]"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-0 overflow-x-auto px-6 sm:gap-1 sm:px-12 lg:px-20 xl:px-32">
        {TABS.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'focus-ring relative inline-flex shrink-0 items-center gap-2 px-3 py-3 text-[0.8125rem] font-medium transition-colors sm:px-3.5 sm:py-3',
                active ? 'text-ink' : 'text-ink-muted hover:text-ink',
              ].join(' ')}
            >
              <Icon
                className={[
                  'h-4 w-4 transition-colors',
                  active ? 'text-seal-deep' : 'text-ink-faint',
                ].join(' ')}
                aria-hidden="true"
              />
              <span>{t.label}</span>
              <span
                aria-hidden="true"
                className={[
                  'pointer-events-none absolute inset-x-2 -bottom-px h-[2px] transition-opacity duration-200',
                  active ? 'bg-seal opacity-100' : 'opacity-0',
                ].join(' ')}
              />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
