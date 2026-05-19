'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/app/components/Logo';

type ParsedParams = {
  tokenHash: string;
  type: string;
  remember: boolean;
  ready: boolean;
};

export default function ConfirmSignInPage() {
  const [params, setParams] = useState<ParsedParams>({
    tokenHash: '',
    type: 'magiclink',
    remember: true,
    ready: false,
  });
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    const qp = new URLSearchParams(window.location.search);
    setParams({
      tokenHash: qp.get('token_hash') ?? '',
      type: qp.get('type') ?? 'magiclink',
      remember: qp.get('remember') !== '0',
      ready: true,
    });
  }, []);

  const missingToken = params.tokenHash.length < 20;
  const helperText = !params.ready
    ? 'Loading...'
    : missingToken
      ? 'This sign-in link is incomplete.'
      : 'Tap Continue to finish signing in securely.';

  async function completeSignIn() {
    if (missingToken || status === 'working') return;
    setStatus('working');
    setError('');

    const res = await fetch('/api/auth/complete-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenHash: params.tokenHash,
        type: params.type,
        remember: params.remember,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Could not complete sign-in.' }));
      setStatus('error');
      setError(body.error ?? 'Could not complete sign-in.');
      return;
    }

    window.location.assign('/');
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 pb-20 pt-10 sm:px-8">
      <Link href="/" aria-label="The Policy Place home" className="focus-ring -m-1 inline-flex w-fit rounded p-1">
        <Logo tone="dark" />
      </Link>

      <div className="mt-16 rounded-xl border border-hairline bg-card p-6 sm:p-8">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Secure sign-in</p>
        <h1 className="font-display mt-3 text-3xl leading-tight text-ink">Continue sign-in</h1>
        <p className="mt-4 text-sm leading-relaxed text-ink-muted">{helperText}</p>

        {error && <p className="mt-4 text-sm leading-relaxed text-danger">{error}</p>}

        <button
          type="button"
          onClick={completeSignIn}
          disabled={!params.ready || missingToken || status === 'working'}
          className="focus-ring mt-7 inline-flex w-full items-center justify-center rounded-md bg-brand px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-55"
        >
          {status === 'working' ? 'Signing you in...' : 'Continue'}
        </button>

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          If this fails, return to the{' '}
          <Link href="/login" className="text-brand underline-offset-4 hover:underline">
            sign-in page
          </Link>
          {' '}and enter your email again.
        </p>
      </div>
    </main>
  );
}
