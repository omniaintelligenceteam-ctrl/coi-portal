'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, LogOut, Menu } from 'lucide-react';
import { Logo } from './Logo';
import { MobileSheet } from './ui/MobileSheet';
import { Button } from './ui/Button';
import { ButtonLink } from './ui/ButtonLink';
import { IconButton } from './ui/IconButton';
import { PageShell } from './ui/PageShell';
import { ThemeToggle } from './ThemeToggle';
import { createClient } from '@/lib/supabase/browser';

/**
 * Global Header — sticky, paper-toned, refined for desktop + mobile.
 *
 * Desktop (md+): logo · agent badge (if any) · email pill · "My certs" · "Sign out".
 * Mobile: logo · agent badge (compact) · avatar/hamburger → drawer with full nav.
 *
 * The drawer (MobileSheet) holds: account email, "My certs", "Sign out", and
 * — when rendered under /admin — the full admin nav (Queue, Generate, Access,
 * Settings) as a vertical list, so admins can navigate without scrolling tabs.
 */
export function Header({
  email,
  badge,
  showMyCerts = false,
}: {
  email: string;
  badge?: string;
  showMyCerts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const isAdmin = pathname.startsWith('/admin');

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      /* fall through — protected pages will re-redirect on next nav */
    }
    setOpen(false);
    router.push('/login');
    router.refresh();
  }

  const initials = (email?.[0] ?? '?').toUpperCase();

  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-hairline bg-paper/85 backdrop-blur-md">
      <PageShell as="div" className="flex items-center justify-between gap-4 py-3.5 sm:gap-6 sm:py-4">
        <Link
          href={isAdmin ? '/admin' : '/'}
          className="focus-ring -m-1 rounded-md p-1"
          aria-label="The Policy Place — home"
        >
          <Logo tone="dark" />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {badge && (
            <span className="caps inline-flex items-center gap-1.5 rounded-full border border-seal/30 bg-seal-soft px-2.5 py-0.5 text-[0.62rem] font-semibold text-seal-deep">
              <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
              {badge}
            </span>
          )}

          {/* Desktop actions */}
          <span className="hidden font-mono text-[0.72rem] text-ink-muted lg:inline">
            {email}
          </span>
          <ThemeToggle className="hidden md:inline-flex" />
          {showMyCerts && (
            <ButtonLink
              href="/certificates"
              variant="secondary"
              size="sm"
              uppercase
              leadingIcon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
              className="hidden md:inline-flex"
            >
              My certs
            </ButtonLink>
          )}
          <Button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            variant="ghost"
            size="sm"
            uppercase
            leadingIcon={<LogOut className="h-3.5 w-3.5" aria-hidden="true" />}
            className="hidden md:inline-flex"
          >
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>

          {/* Mobile drawer trigger */}
          <IconButton
            label="Open menu"
            size="sm"
            variant="secondary"
            onClick={() => setOpen(true)}
            className="md:hidden"
          >
            <span className="relative inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand text-[0.7rem] font-semibold text-white">
              {initials}
            </span>
          </IconButton>
        </div>
      </PageShell>

      <MobileSheet
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Account menu"
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand text-[0.95rem] font-semibold text-white">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="truncate font-mono text-[0.8125rem] text-ink">{email}</div>
              {badge && (
                <div className="caps mt-1 inline-flex items-center gap-1.5 text-[0.62rem] font-semibold text-seal-deep">
                  <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
                  {badge}
                </div>
              )}
            </div>
          </div>

          {isAdmin && (
            <nav aria-label="Admin sections" className="flex flex-col gap-1">
              <div className="caps mb-1 text-[0.62rem] font-semibold text-ink-faint">
                Admin
              </div>
              <DrawerLink
                href="/admin"
                active={pathname === '/admin' || pathname === '/admin/'}
                onClick={() => setOpen(false)}
              >
                Home
              </DrawerLink>
              <DrawerLink
                href="/admin/queue"
                active={pathname.startsWith('/admin/queue')}
                onClick={() => setOpen(false)}
              >
                Queue
              </DrawerLink>
              <DrawerLink
                href="/admin/generate"
                active={pathname.startsWith('/admin/generate')}
                onClick={() => setOpen(false)}
              >
                Generate
              </DrawerLink>
              <DrawerLink
                href="/admin/clients"
                active={pathname.startsWith('/admin/clients')}
                onClick={() => setOpen(false)}
              >
                Clients
              </DrawerLink>
              <DrawerLink
                href="/admin/access-requests"
                active={pathname.startsWith('/admin/access-requests')}
                onClick={() => setOpen(false)}
              >
                Access requests
              </DrawerLink>
              <DrawerLink
                href="/admin/settings"
                active={pathname.startsWith('/admin/settings')}
                onClick={() => setOpen(false)}
              >
                Settings
              </DrawerLink>
            </nav>
          )}

          <div className="flex items-center justify-between">
            <span className="caps text-[0.62rem] font-semibold text-ink-faint">Theme</span>
            <ThemeToggle size="md" />
          </div>

          <nav aria-label="Account" className="flex flex-col gap-1">
            <div className="caps mb-1 text-[0.62rem] font-semibold text-ink-faint">
              Account
            </div>
            {showMyCerts && (
              <DrawerLink href="/certificates" onClick={() => setOpen(false)}>
                <FileText className="h-4 w-4 text-ink-muted" aria-hidden="true" />
                My certificates
              </DrawerLink>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="focus-ring flex items-center gap-3 rounded-md px-3 py-3 text-left text-[0.9rem] text-ink transition-colors hover:bg-paper-deep/60 disabled:opacity-60"
            >
              <LogOut className="h-4 w-4 text-ink-muted" aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </nav>

          <div className="border-t border-hairline pt-4 text-[0.75rem] leading-[1.5] text-ink-muted">
            The Policy Place
            <br />
            <a
              href="tel:+12704102015"
              className="text-ink underline-offset-2 hover:underline"
            >
              (270) 410-2015
            </a>{' '}
            ·{' '}
            <a
              href="mailto:brook@yourpolicyplace.com"
              className="text-ink underline-offset-2 hover:underline"
            >
              brook@yourpolicyplace.com
            </a>
          </div>
        </div>
      </MobileSheet>
    </header>
  );
}

function DrawerLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'focus-ring flex items-center gap-3 rounded-md px-3 py-3 text-[0.9rem] transition-colors',
        active
          ? 'bg-brand-soft text-brand-deep'
          : 'text-ink hover:bg-paper-deep/60',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}
