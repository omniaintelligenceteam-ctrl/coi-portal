'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { FieldShake } from '../components/motion';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_failed: 'Your last sign-in attempt expired. Enter your email and try again.',
  revoked: 'Your access was removed. Contact your Policy Place admin if this is a mistake.',
};

function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('valid email')) {
    return "That email doesn't look right. Please check it and try again.";
  }
  if (lower.includes("isn't set up for portal access")) {
    return "That email isn't approved yet. Use Request access below and we'll review it.";
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts were made. Wait a minute, then try again.';
  }
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [errorTick, setErrorTick] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('error');
    if (!errCode) return;
    const message =
      CALLBACK_ERROR_MESSAGES[errCode] ??
      'Something went wrong with sign-in. Enter your email and try again.';
    setStatus('error');
    setErrorMsg(message);
    setErrorTick((t) => t + 1);

    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.toString());
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'signing-in') return;

    setStatus('signing-in');
    setErrorMsg('');

    const res = await fetch('/api/auth/request-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Could not sign you in.' }));
      setStatus('error');
      setErrorMsg(friendlyAuthError(body.error ?? 'Could not sign you in.'));
      setErrorTick((t) => t + 1);
      return;
    }

    window.location.assign('/');
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 sm:px-10">
        <Link
          href="/"
          aria-label="The Policy Place home"
          className="focus-ring -m-1 inline-flex rounded p-1"
        >
          <Logo tone="dark" />
        </Link>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 pb-24 pt-10 sm:px-10 sm:pt-12 lg:px-16 lg:pt-16 xl:px-24">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-2xl border border-hairline bg-card px-6 py-7 shadow-lift sm:px-9 sm:py-9"
        >
          <p className="caps text-[0.65rem] font-semibold text-seal-deep">Certificate Portal</p>
          <h1 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3rem]">
            Sign in with your approved email.
          </h1>
          <p className="mt-4 max-w-lg text-[0.96rem] leading-relaxed text-ink-muted">
            One step on desktop or mobile. Enter the email your Policy Place admin approved and
            we&apos;ll sign you in right away.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div>
              <label
                htmlFor="email"
                className="caps block text-[0.62rem] font-semibold text-ink-muted"
              >
                Email address
              </label>
              <FieldShake errorKey={errorTick}>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                  enterKeyHint="go"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="field-underline mt-2 block w-full font-sans text-lg text-ink"
                />
              </FieldShake>
            </div>

            {status === 'error' && <p className="text-sm leading-relaxed text-danger">{errorMsg}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="submit"
                disabled={status === 'signing-in'}
                className="focus-ring inline-flex w-full items-center justify-center rounded-md bg-brand px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === 'signing-in' ? 'Signing in...' : 'Sign in'}
              </button>

              <Link
                href="/signup"
                className="focus-ring inline-flex w-full items-center justify-center rounded-md border border-brand/45 bg-brand-soft px-6 py-3.5 text-sm font-semibold text-brand-deep transition-colors hover:bg-brand/12"
              >
                Request access
              </Link>
            </div>
          </form>
        </motion.section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 sm:px-10">
        <Hairline />
        <div className="mt-5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="caps text-[0.65rem] font-medium text-ink-faint">
            The Policy Place | 908 Poplar St | Benton KY 42025
          </p>
          <p className="caps text-[0.65rem] font-medium text-ink-faint">
            <a href="tel:+12704102015" className="hover:text-ink">
              (270) 410-2015
            </a>
            <span className="mx-2 text-ink-faint/60">|</span>
            <a
              href="https://www.yourpolicyplace.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink"
            >
              yourpolicyplace.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
