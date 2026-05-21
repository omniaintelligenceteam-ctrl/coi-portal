'use client';

/**
 * Cmd-K command palette — Statement Phase 2a elevation.
 *
 * Single keystroke takes you anywhere. Three result groups:
 *   1. Clients — search coi_clients by business_name (substring match)
 *   2. Recent certificates — match cert_number substring
 *   3. Jump to — fixed list of section anchors (Home, Queue, Generate,
 *      Clients, Settings, Certificates, Design system)
 * Plus a Session group with Sign out.
 *
 * Both queries fire in parallel, debounced 120ms.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  FileText,
  Home,
  Inbox,
  LogOut,
  Palette,
  Plus,
  Settings,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';

type CertHit = {
  id: string;
  cert_number: string;
  holder_name: string | null;
  status: string;
};

type ClientHit = {
  id: string;
  business_name: string;
  contact_email: string;
};

type Jump = {
  label: string;
  href: string;
  sub: string;
  icon: LucideIcon;
};

const JUMPS: Jump[] = [
  { label: 'Home',        href: '/admin',                 sub: "Today's activity & queue",      icon: Home },
  { label: 'Queue',       href: '/admin/queue',           sub: 'Requests awaiting review',      icon: Inbox },
  { label: 'Generate',    href: '/admin/generate',        sub: 'Issue a certificate',           icon: Plus },
  { label: 'Clients',     href: '/admin/clients',         sub: 'All insureds',                  icon: Users },
  { label: 'Settings',    href: '/admin/settings',        sub: 'Clients, overrides, automation', icon: Settings },
  { label: 'Certificates', href: '/certificates',         sub: 'All certificates',              icon: FileText },
  { label: 'Design system', href: '/admin/design',        sub: 'Primitive QA reference',        icon: Palette },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [certs, setCerts] = useState<CertHit[]>([]);
  const [clients, setClients] = useState<ClientHit[]>([]);
  const reduce = useReducedMotion();

  // ⌘K / Ctrl+K toggle. Don't fire while typing in another input.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Debounced parallel search: certs + clients.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const supabase = createClient();
    let cancelled = false;

    const t = setTimeout(async () => {
      const certBuilder = supabase
        .from('cert_requests')
        .select('id, cert_number, holder_name, status')
        .order('requested_at', { ascending: false })
        .limit(6);
      const clientBuilder = supabase
        .from('coi_clients')
        .select('id, business_name, contact_email')
        .order('business_name', { ascending: true })
        .limit(6);

      const certPromise = term.length > 0
        ? certBuilder.ilike('cert_number', `%${term}%`)
        : certBuilder;
      const clientPromise = term.length > 0
        ? clientBuilder.ilike('business_name', `%${term}%`)
        : clientBuilder;

      const [certResult, clientResult] = await Promise.all([certPromise, clientPromise]);

      if (!cancelled) {
        setCerts((certResult.data as CertHit[]) ?? []);
        setClients((clientResult.data as ClientHit[]) ?? []);
      }
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  async function signOut() {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // fall through
    }
    router.push('/login');
  }

  function jump(href: string) {
    close();
    router.push(href);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-sm"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-[var(--r-lg)] border border-hairline-strong bg-card shadow-[var(--shadow-lift)]"
          >
            <Command label="Command palette" shouldFilter={false}>
              <div className="flex items-center justify-between border-b border-hairline px-5 pb-3 pt-4">
                <p className="text-[1rem] font-medium tracking-[-0.01em] text-ink">
                  Quick jump
                </p>
                <p className="caps text-[0.58rem] font-medium text-ink-faint">
                  Esc to close
                </p>
              </div>
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder="Search certs, clients, or jump anywhere…"
                className="field-underline mx-5 mt-1 mb-2 block w-[calc(100%-2.5rem)] text-ink"
              />
              <Command.List className="max-h-[50vh] overflow-y-auto px-2 pb-3">
                <Command.Empty className="px-4 py-6 text-center text-[0.85rem] text-ink-faint">
                  Nothing matches that.
                </Command.Empty>

                {clients.length > 0 && (
                  <Command.Group
                    heading="Clients"
                    className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                  >
                    {clients.map((c) => (
                      <Command.Item
                        key={c.id}
                        value={`client-${c.id}-${c.business_name}`}
                        onSelect={() => jump(`/admin/clients/${c.id}`)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/60"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <Users className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                          <span className="truncate font-medium text-ink">{c.business_name}</span>
                        </span>
                        <span className="font-mono text-[0.7rem] text-ink-faint">
                          {c.contact_email}
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                {certs.length > 0 && (
                  <Command.Group
                    heading="Recent certificates"
                    className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                  >
                    {certs.map((h) => (
                      <Command.Item
                        key={h.id}
                        value={`cert-${h.id}-${h.cert_number}`}
                        onSelect={() => jump(`/admin/queue/${h.id}`)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/60"
                      >
                        <span className="font-mono text-[0.8rem] font-medium tabular-nums text-ink">
                          {h.cert_number}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="truncate text-[0.8rem] text-ink-muted">
                            {h.holder_name ?? '—'}
                          </span>
                          <span className="caps text-[0.58rem] font-semibold text-ink-faint">
                            {h.status}
                          </span>
                        </span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}

                <Command.Group
                  heading="Jump to"
                  className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                >
                  {JUMPS.map((j) => {
                    const Icon = j.icon;
                    return (
                      <Command.Item
                        key={j.href}
                        value={`jump-${j.label}`}
                        onSelect={() => jump(j.href)}
                        className="flex cursor-pointer items-baseline justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/60"
                      >
                        <span className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                          <span className="font-medium text-ink">{j.label}</span>
                        </span>
                        <span className="text-[0.78rem] text-ink-muted">{j.sub}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>

                <Command.Group
                  heading="Session"
                  className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                >
                  <Command.Item
                    value="sign-out"
                    onSelect={signOut}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/60"
                  >
                    <span className="flex items-center gap-2">
                      <LogOut className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />
                      <span className="font-medium text-ink">Sign out</span>
                    </span>
                    <span className="text-[0.78rem] text-ink-muted">End this admin session</span>
                  </Command.Item>
                </Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
