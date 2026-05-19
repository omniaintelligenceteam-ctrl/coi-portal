'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/lib/supabase/browser';
import { FieldShake } from '../components/motion';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_failed:
    'Your sign-in link expired or was already used. Request a new one below.',
};

function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many sign-in attempts were requested recently. Wait a few minutes, then try again.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return "That email address doesn't look right. Double-check the spelling.";
  }
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('error');
    if (!errCode) return;
    const message =
      CALLBACK_ERROR_MESSAGES[errCode] ??
      'Something went wrong with your sign-in link. Please request a new one.';
    setStatus('error');
    setErrorMsg(message);
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.toString());
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    const res = await fetch('/api/auth/request-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, remember: rememberMe }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Could not send your sign-in link.' }));
      setStatus('error');
      setErrorMsg(friendlyAuthError(body.error ?? 'Could not send your sign-in link.'));
      return;
    }

    setCode('');
    setCodeStatus('idle');
    setCodeError('');
    setStatus('sent');
  }

  async function handleCodeVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = code.trim();
    if (!token || codeStatus === 'verifying') return;

    setCodeStatus('verifying');
    setCodeError('');

    const supabase = createClient();
    let { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'magiclink',
    });

    if (error) {
      const fallback = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });
      error = fallback.error;
    }

    if (error) {
      setCodeStatus('error');
      setCodeError(friendlyAuthError(error.message));
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-2xl"
        >
          <AnimatePresence mode="wait">
            {status === 'sent' ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <SentState
                  email={email}
                  code={code}
                  codeStatus={codeStatus}
                  codeError={codeError}
                  setCode={setCode}
                  onVerifyCode={handleCodeVerify}
                  onReset={() => {
                    setStatus('idle');
                    setCode('');
                    setCodeError('');
                    setCodeStatus('idle');
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <SignInForm
                  email={email}
                  setEmail={setEmail}
                  rememberMe={rememberMe}
                  setRememberMe={setRememberMe}
                  status={status}
                  errorMsg={errorMsg}
                  onSubmit={handleSubmit}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 sm:px-10">
        <Hairline />
        <div className="mt-5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="caps text-[0.65rem] font-medium text-ink-faint">
            The Policy Place · 908 Poplar St · Benton KY 42025
          </p>
          <p className="caps text-[0.65rem] font-medium text-ink-faint">
            <a href="tel:+12704102015" className="hover:text-ink">
              (270) 410-2015
            </a>
            <span className="mx-2 text-ink-faint/60">·</span>
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

function SignInForm({
  email,
  setEmail,
  rememberMe,
  setRememberMe,
  status,
  errorMsg,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  rememberMe: boolean;
  setRememberMe: (v: boolean) => void;
  status: 'idle' | 'sending' | 'sent' | 'error';
  errorMsg: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [errorTick, setErrorTick] = useState(0);
  useEffect(() => {
    if (status === 'error') setErrorTick((t) => t + 1);
  }, [status, errorMsg]);

  return (
    <>
      <p className="caps text-[0.65rem] font-semibold text-seal-deep">Certificate Portal</p>
      <h1 className="font-display mt-3 text-[2.1rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3.25rem]">
        Sign in to <em className="not-italic text-brand">request</em> a certificate.
      </h1>
      <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-ink-muted">
        We&apos;ll send a secure sign-in link. If mobile email apps interfere, you can use the backup code in the same email.
      </p>

      <form onSubmit={onSubmit} className="mt-10 space-y-7">
        <div>
          <label htmlFor="email" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Email address
          </label>
          <FieldShake errorKey={errorTick}>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="field-underline mt-2 block w-full font-sans text-lg text-ink"
            />
          </FieldShake>
        </div>

        <label className="-m-2 inline-flex cursor-pointer select-none items-center gap-3 rounded p-2">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className={[
              'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40',
              rememberMe ? 'border-brand bg-brand' : 'border-hairline-strong bg-card',
            ].join(' ')}
          >
            {rememberMe && (
              <svg
                className="h-3 w-3 text-white"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 6.5L4.5 9L10 3.5" />
              </svg>
            )}
          </span>
          <span className="text-sm text-ink">
            Keep me signed in on this device
            <span className="ml-1 text-ink-faint">(30 days)</span>
          </span>
        </label>

        {status === 'error' && (
          <p className="text-sm leading-relaxed text-danger">
            {errorMsg}
          </p>
        )}

        <div className="space-y-4">
          <div className="relative group">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -m-2 hidden rounded-full bg-brand opacity-30 blur-lg transition-all duration-300 ease-out group-hover:-m-3 group-hover:opacity-50 group-hover:blur-xl sm:block"
            />
            <button
              type="submit"
              disabled={status === 'sending'}
              className="focus-ring relative z-10 inline-flex w-full items-center justify-center gap-2 rounded-full bg-linear-to-br from-brand to-brand-deep px-6 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:from-brand-deep hover:to-brand-near disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:from-brand disabled:hover:to-brand-deep"
            >
              <span>{status === 'sending' ? 'Sending link...' : 'Send secure sign-in link'}</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>

          <Link
            href="/signup"
            className="focus-ring caps inline-flex w-full items-center justify-center rounded-full border border-brand/40 bg-transparent px-6 py-3 text-[0.65rem] font-semibold tracking-caps text-brand-deep transition-colors hover:border-brand hover:bg-brand-soft"
          >
            No account? Request access &rarr;
          </Link>
        </div>
      </form>
    </>
  );
}

function SentState({
  email,
  code,
  codeStatus,
  codeError,
  setCode,
  onVerifyCode,
  onReset,
}: {
  email: string;
  code: string;
  codeStatus: 'idle' | 'verifying' | 'error';
  codeError: string;
  setCode: (v: string) => void;
  onVerifyCode: (e: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-seal/30 bg-seal-soft px-3 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-seal" aria-hidden="true" />
        <span className="caps text-[0.62rem] font-semibold text-seal-deep">Link sent</span>
      </div>
      <h2 className="font-display mt-5 text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
        Check your inbox.
      </h2>
      <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-muted">
        We sent a sign-in link and backup code to
      </p>
      <p className="mt-2 break-all font-mono text-base font-medium text-ink">{email}</p>

      <form onSubmit={onVerifyCode} className="mt-8 space-y-3 rounded-xl border border-hairline bg-card p-4">
        <label htmlFor="backup-code" className="caps block text-[0.6rem] font-semibold text-ink-muted">
          Backup code (optional)
        </label>
        <input
          id="backup-code"
          type="text"
          autoComplete="one-time-code"
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
          placeholder="Enter code from email"
          className="field-underline block w-full font-mono text-lg tracking-[0.18em] text-ink"
        />
        {codeError && <p className="text-sm text-danger">{codeError}</p>}
        <button
          type="submit"
          disabled={!code.trim() || codeStatus === 'verifying'}
          className="focus-ring inline-flex w-full items-center justify-center rounded-md border border-brand/40 bg-brand-soft px-4 py-2.5 text-sm font-semibold text-brand-deep transition-colors hover:bg-brand/12 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {codeStatus === 'verifying' ? 'Signing in...' : 'Sign in with code'}
        </button>
      </form>

      <div className="mt-8 space-y-2">
        <p className="caps text-[0.6rem] font-medium text-ink-faint">Link expires in 1 hour</p>
        <button
          onClick={onReset}
          className="focus-ring text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Use a different email &rarr;
        </button>
      </div>
    </div>
  );
}

function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}

