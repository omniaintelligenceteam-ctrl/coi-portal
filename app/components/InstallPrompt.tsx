'use client';

/**
 * PWA install prompt — Statement Phase 4.
 *
 * Subtle banner that surfaces after the user has been on the site for 8
 * seconds, ONLY if the browser fires `beforeinstallprompt` (i.e. the app
 * is actually installable from this context). Dismissals persist in
 * localStorage so users who said no don't get re-nagged for 30 days.
 *
 * iOS Safari doesn't fire beforeinstallprompt; for iOS we detect Safari
 * standalone capability and show an Add-to-Home-Screen hint instead.
 *
 * Mounted in the main layout. Renders nothing on admin surfaces — only
 * clients benefit from installing.
 */

import { useEffect, useState } from 'react';
import { Share2, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DISMISS_KEY = 'pp.install-dismissed-until';
const SNOOZE_DAYS = 30;
const SHOW_AFTER_MS = 8000;

export function InstallPrompt() {
  const [phase, setPhase] = useState<'hidden' | 'android' | 'ios'>('hidden');
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Respect prior dismissal.
    const until = readDismissUntil();
    if (until && until > Date.now()) return;

    // Already installed? Bail.
    if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) return;
    // iOS standalone webapp mode (legacy Safari API)
    if (typeof navigator !== 'undefined' && (navigator as unknown as { standalone?: boolean }).standalone) return;

    // Hide on admin surfaces — admins are on desktop, install is for client phone use.
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) return;

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      const t = setTimeout(() => setPhase('android'), SHOW_AFTER_MS);
      return () => clearTimeout(t);
    };

    window.addEventListener('beforeinstallprompt', onBefore);

    // iOS Safari fallback: show a hint after the delay only if we're on iOS.
    const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
    let iosTimer: ReturnType<typeof setTimeout> | null = null;
    if (isIOS && !deferredPrompt) {
      iosTimer = setTimeout(() => setPhase((p) => (p === 'hidden' ? 'ios' : p)), SHOW_AFTER_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      if (iosTimer) clearTimeout(iosTimer);
    };
  }, [deferredPrompt]);

  function dismiss() {
    writeDismissUntil(Date.now() + SNOOZE_DAYS * 86_400_000);
    setPhase('hidden');
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'dismissed') {
      writeDismissUntil(Date.now() + SNOOZE_DAYS * 86_400_000);
    }
    setDeferredPrompt(null);
    setPhase('hidden');
  }

  if (phase === 'hidden') return null;

  return (
    <div
      role="dialog"
      aria-label="Install The Policy Place"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-safe"
    >
      <div className="pointer-events-auto m-4 flex w-full max-w-md items-start gap-3 rounded-[var(--r-lg)] border border-hairline-strong bg-card p-4 shadow-lift slide-up">
        <Share2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem] font-medium leading-[1.3] text-ink">
            {phase === 'ios' ? 'Save Policy Place to your home screen' : 'Install Policy Place'}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-[1.45] text-ink-muted">
            {phase === 'ios'
              ? 'Tap the share icon, then "Add to Home Screen" — opens just like an app.'
              : 'One-tap access from your home screen. No app store, no password.'}
          </p>
          {phase === 'android' && (
            <button
              type="button"
              onClick={install}
              className="focus-ring mt-3 inline-flex items-center rounded-md bg-brand px-3 py-1.5 text-[0.8125rem] font-medium text-white transition-colors hover:bg-brand-deep"
            >
              Install
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="focus-ring -m-1 rounded p-1 text-ink-faint transition-colors hover:text-ink"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function readDismissUntil(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeDismissUntil(ts: number) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(ts));
  } catch {
    // ignore
  }
}
