'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Mail } from 'lucide-react';
import { FieldShake } from '../components/motion';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';
import { Button, ButtonLink } from '../components/ui';

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
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="mx-auto w-full max-w-5xl px-8 pt-safe sm:px-12 lg:px-20 xl:px-32">
        <Link
          href="/"
          aria-label="The Policy Place home"
          className="focus-ring -m-1 mt-6 inline-flex rounded p-1 sm:mt-8"
        >
          <Logo tone="dark" />
        </Link>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-8 pb-12 pt-8 sm:px-12 sm:pt-12 lg:px-20 lg:pt-16 xl:px-32">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-xl overflow-hidden rounded-[var(--r-lg)] border border-hairline bg-card px-6 py-8 shadow-lift sm:px-10 sm:py-10"
        >
          {/* Decorative seal mark in the corner */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-seal/15 bg-seal-soft/30"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full border border-seal/20"
          />

          <p className="caps relative text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
            Certificate Portal
          </p>
          <h1 className="font-display relative mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.5rem]">
            Welcome back.
          </h1>
          <p className="relative mt-3 max-w-md text-[0.9375rem] leading-[1.6] text-ink-muted">
            One step on desktop or mobile. Enter the email your Policy Place admin
            approved and we&apos;ll sign you in right away.
          </p>

          <form onSubmit={handleSubmit} className="relative mt-8 flex flex-col gap-5">
            <div>
              <label
                htmlFor="email"
                className="caps block text-[0.65rem] font-semibold text-ink-muted"
              >
                Email address
              </label>
              <FieldShake errorKey={errorTick}>
                <div className="relative mt-2">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  />
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
                    className="field-box pl-10 text-[1rem] text-ink"
                    aria-invalid={status === 'error' || undefined}
                  />
                </div>
              </FieldShake>
            </div>

            {status === 'error' && (
              <p
                role="alert"
                className="rounded-md border border-danger/30 bg-danger-soft/60 px-3.5 py-2.5 text-[0.8125rem] leading-[1.5] text-ink"
              >
                {errorMsg}
              </p>
            )}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={status === 'signing-in'}
                trailingIcon={
                  status !== 'signing-in' ? (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  ) : null
                }
              >
                {status === 'signing-in' ? 'Signing in…' : 'Sign in'}
              </Button>
              <ButtonLink
                href="/signup"
                variant="secondary"
                size="lg"
                fullWidth
                className="border-brand/40 bg-brand-soft/40 text-brand-deep hover:bg-brand-soft"
              >
                Request access
              </ButtonLink>
            </div>
          </form>
        </motion.section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-8 pb-8 pb-safe sm:px-12 lg:px-20 xl:px-32">
        <Hairline />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="caps text-[0.65rem] font-medium text-ink-faint">
            The Policy Place &middot; 908 Poplar St &middot; Benton KY 42025
          </p>
          <p className="caps flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-medium text-ink-faint">
            <a href="tel:+12704102015" className="text-ink-muted hover:text-ink">
              (270) 410-2015
            </a>
            <span aria-hidden="true" className="text-ink-faint/60">
              &middot;
            </span>
            <a
              href="https://www.yourpolicyplace.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink-muted hover:text-ink"
            >
              yourpolicyplace.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
