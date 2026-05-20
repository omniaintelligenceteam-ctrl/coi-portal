'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { Logo } from '@/app/components/Logo';
import { Banner, Button, Card } from '@/app/components/ui';

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
    ? 'Loading…'
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col px-6 pb-12 pt-safe sm:px-8">
      <Link
        href="/"
        aria-label="The Policy Place home"
        className="focus-ring -m-1 mt-6 inline-flex w-fit rounded p-1 sm:mt-8"
      >
        <Logo tone="dark" />
      </Link>

      <Card padding="lg" raised className="mt-14">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-seal/35 bg-seal-soft">
          <Lock className="h-5 w-5 text-seal-deep" aria-hidden="true" />
        </div>
        <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
          Secure sign-in
        </p>
        <h1 className="font-display mt-3 text-[1.75rem] font-medium leading-[1.1] tracking-tight text-ink sm:text-[2rem]">
          Continue sign-in
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-[1.55] text-ink-muted">{helperText}</p>

        {error && (
          <Banner tone="danger" className="mt-5">
            {error}
          </Banner>
        )}

        <Button
          type="button"
          onClick={completeSignIn}
          disabled={!params.ready || missingToken}
          loading={status === 'working'}
          size="lg"
          fullWidth
          trailingIcon={
            status !== 'working' ? (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            ) : null
          }
          className="mt-7"
        >
          {status === 'working' ? 'Signing you in…' : 'Continue'}
        </Button>

        <p className="mt-4 text-[0.78rem] leading-[1.55] text-ink-faint">
          If this fails, return to the{' '}
          <Link href="/login" className="text-brand-deep underline-offset-4 hover:underline">
            sign-in page
          </Link>
          {' '}and enter your email again.
        </p>
      </Card>
    </main>
  );
}
