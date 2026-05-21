'use client';

/**
 * Persistent sidebar nav for the admin surface — Statement Phase 2a.
 *
 * Desktop (md+): renders as a left rail. Replaces the prior horizontal
 *   AdminTabs strip. Vertical layout scales as new sections land
 *   (Renewals, Reports, Form-builder) without horizontal overflow.
 * Mobile (<md): hidden. The existing Header mobile drawer carries the same
 *   nav, so mobile users navigate via the avatar in the top right.
 *
 * Layout: brand mark · Cmd-K prompt · Today (Home, Queue, Generate, Clients,
 * Access) · Manage (Settings) · spacer · user card · theme toggle.
 *
 * Cmd-K integration: the search prompt at the top dispatches a CustomEvent
 * that the existing <CommandPalette /> listens for. Keeps coupling loose.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Inbox,
  FilePlus,
  Users,
  UserPlus,
  Settings,
  Search,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ThemeToggle } from '@/app/components/ThemeToggle';

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** A predicate is stricter than href.startsWith() — Home needs exact match. */
  match: (path: string) => boolean;
};

type Group = {
  heading: string;
  items: Item[];
};

const GROUPS: Group[] = [
  {
    heading: 'Today',
    items: [
      {
        label: 'Home',
        href: '/admin',
        icon: Home,
        match: (p) => p === '/admin' || p === '/admin/',
      },
      {
        label: 'Queue',
        href: '/admin/queue',
        icon: Inbox,
        match: (p) => p.startsWith('/admin/queue'),
      },
      {
        label: 'Generate',
        href: '/admin/generate',
        icon: FilePlus,
        match: (p) => p.startsWith('/admin/generate') || p.startsWith('/admin/import-policy'),
      },
      {
        label: 'Clients',
        href: '/admin/clients',
        icon: Users,
        match: (p) => p.startsWith('/admin/clients'),
      },
      {
        label: 'Access',
        href: '/admin/access-requests',
        icon: UserPlus,
        match: (p) => p.startsWith('/admin/access-requests'),
      },
    ],
  },
  {
    heading: 'Manage',
    items: [
      {
        label: 'Settings',
        href: '/admin/settings',
        icon: Settings,
        match: (p) => p.startsWith('/admin/settings'),
      },
    ],
  },
];

export function SidebarNav({
  brand,
  user,
  badges,
}: {
  brand?: { mark: string; name: string };
  user?: { initials: string; name: string; role: string };
  badges?: Partial<Record<'queue' | 'clients' | 'access', number>>;
}) {
  const pathname = usePathname() ?? '';
  const [shortcut, setShortcut] = useState<'⌘ K' | 'Ctrl K'>('⌘ K');

  useEffect(() => {
    // Show ⌘ on macOS, Ctrl elsewhere — small but signals OS awareness.
    if (typeof navigator !== 'undefined' && !/Mac|iPhone|iPad/.test(navigator.platform)) {
      setShortcut('Ctrl K');
    }
  }, []);

  function openCommandPalette() {
    // Dispatch a synthetic ⌘K so CommandPalette opens without needing a direct
    // import or shared global. CommandPalette listens for keydown.
    const evt = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(evt);
  }

  return (
    <aside
      aria-label="Admin navigation"
      className="hidden h-[calc(100dvh-var(--header-height-sm))] w-[232px] shrink-0 flex-col border-r border-hairline bg-paper-deep/40 px-3 py-5 md:sticky md:top-[var(--header-height-sm)] md:flex"
    >
      {/* Brand */}
      <Link
        href="/admin"
        className="focus-ring -mx-1 mb-4 inline-flex items-center gap-2.5 rounded-md p-1.5"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-[0.7rem] font-semibold text-white">
          {brand?.mark ?? 'P'}
        </span>
        <span className="text-[0.875rem] font-medium tracking-[-0.01em] text-ink">
          {brand?.name ?? 'The Policy Place'}
        </span>
      </Link>

      {/* Cmd-K prompt */}
      <button
        type="button"
        onClick={openCommandPalette}
        className="focus-ring mb-4 flex items-center gap-2 rounded-md border border-hairline-strong bg-card px-2.5 py-2 text-[0.78rem] text-ink-faint transition-colors hover:border-ink/40 hover:text-ink"
      >
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Search anything</span>
        <kbd className="ml-auto rounded border border-hairline-strong bg-paper-deep px-1.5 py-0.5 font-mono text-[0.6rem] text-ink-muted">
          {shortcut}
        </kbd>
      </button>

      {/* Nav groups */}
      <nav className="flex flex-col gap-3">
        {GROUPS.map((g) => (
          <div key={g.heading}>
            <p className="caps mb-1 px-2 text-[0.6rem] font-semibold text-ink-mute">
              {g.heading}
            </p>
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                const badge =
                  item.label === 'Queue'
                    ? badges?.queue
                    : item.label === 'Clients'
                      ? badges?.clients
                      : item.label === 'Access'
                        ? badges?.access
                        : undefined;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'focus-ring flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.875rem] font-medium transition-colors',
                        active
                          ? 'bg-ink text-paper'
                          : 'text-ink-muted hover:bg-card hover:text-ink',
                      ].join(' ')}
                    >
                      <Icon
                        className={[
                          'h-4 w-4',
                          active ? 'text-paper' : 'text-ink-faint',
                        ].join(' ')}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                      {typeof badge === 'number' && badge > 0 && (
                        <span
                          className={[
                            'num-tabular ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold',
                            active
                              ? 'bg-brand text-white'
                              : 'border border-hairline-strong bg-card text-ink-muted',
                          ].join(' ')}
                        >
                          {badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-3 pt-4">
        {/* Theme toggle */}
        <div className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-card px-2.5 py-1.5">
          <span className="caps text-[0.6rem] font-semibold text-ink-faint">Theme</span>
          <ThemeToggle size="sm" />
        </div>

        {/* User card */}
        {user && (
          <div className="flex items-center gap-2.5 border-t border-hairline pt-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-brand text-[0.7rem] font-semibold text-white">
              {user.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[0.85rem] font-medium text-ink">{user.name}</p>
              <p className="text-[0.7rem] text-ink-faint">{user.role}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
