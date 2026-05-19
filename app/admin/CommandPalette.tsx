'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { createClient } from '@/lib/supabase/browser';

type CertHit = {
  id: string;
  cert_number: string;
  holder_name: string | null;
  status: string;
};

const JUMPS: { label: string; href: string; sub: string }[] = [
  { label: 'Queue', href: '/admin/queue', sub: 'Requests awaiting review' },
  { label: 'Generate', href: '/admin/generate', sub: 'Issue a certificate on behalf of a client' },
  { label: 'Settings', href: '/admin/settings', sub: 'Clients, overrides, automation' },
  { label: 'Certificates', href: '/certificates', sub: 'All certificates' },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<CertHit[]>([]);
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

  // Debounced cert search
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const supabase = createClient();
    let cancelled = false;

    const t = setTimeout(async () => {
      const builder = supabase
        .from('cert_requests')
        .select('id, cert_number, holder_name, status')
        .order('requested_at', { ascending: false })
        .limit(8);

      const { data } = term.length > 0
        ? await builder.ilike('cert_number', `%${term}%`)
        : await builder;

      if (!cancelled) setHits((data as CertHit[]) ?? []);
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
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh] backdrop-blur-sm"
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
            className="w-full max-w-xl border border-hairline bg-paper shadow-[var(--shadow-lift)]"
          >
            <Command label="Command palette" shouldFilter={false}>
              <div className="flex items-baseline justify-between border-b border-hairline px-5 pb-3 pt-4">
                <p className="font-display text-[1rem] font-medium tracking-display text-ink">
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
                placeholder="Search certs, jump anywhere…"
                className="field-underline mx-5 mt-1 mb-2 block w-[calc(100%-2.5rem)] text-ink"
              />
              <Command.List className="max-h-[50vh] overflow-y-auto px-2 pb-3">
                <Command.Empty className="px-4 py-6 text-center text-[0.85rem] text-ink-faint">
                  Nothing matches that.
                </Command.Empty>

                {hits.length > 0 && (
                  <Command.Group
                    heading="Recent certificates"
                    className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                  >
                    {hits.map((h) => (
                      <Command.Item
                        key={h.id}
                        value={`cert-${h.id}-${h.cert_number}`}
                        onSelect={() => jump(`/admin/queue/${h.id}`)}
                        className="flex cursor-pointer items-center justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/50"
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
                  {JUMPS.map((j) => (
                    <Command.Item
                      key={j.href}
                      value={`jump-${j.label}`}
                      onSelect={() => jump(j.href)}
                      className="flex cursor-pointer items-baseline justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/50"
                    >
                      <span className="font-medium text-ink">{j.label}</span>
                      <span className="text-[0.78rem] text-ink-muted">{j.sub}</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group
                  heading="Session"
                  className="[&_[cmdk-group-heading]]:caps [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.58rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-faint"
                >
                  <Command.Item
                    value="sign-out"
                    onSelect={signOut}
                    className="flex cursor-pointer items-baseline justify-between gap-3 rounded px-3 py-2 text-[0.88rem] text-ink data-[selected=true]:bg-brand-soft/50"
                  >
                    <span className="font-medium text-ink">Sign out</span>
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
