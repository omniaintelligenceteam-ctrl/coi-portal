'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

/**
 * Tight icon-button logout. Calls Supabase auth.signOut() then sends the user
 * back to /login. Lives in the global Header so Brook can end a session on a
 * shared device without nuking cookies manually.
 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Swallow — we always want to land on /login even if signOut errors,
      // since the next protected page will re-redirect there anyway.
    }
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label="Sign out"
      title="Sign out"
      className="focus-ring tap-target inline-flex items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-white px-3 text-[0.62rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <LogoutIcon className="h-3.5 w-3.5 text-ink-muted" />
      <span className="caps hidden sm:inline">
        {busy ? 'Signing out…' : 'Sign out'}
      </span>
    </button>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12H3m0 0l4-4m-4 4l4 4m4-12h6a2 2 0 012 2v12a2 2 0 01-2 2h-6"
      />
    </svg>
  );
}
