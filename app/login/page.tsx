'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/lib/supabase/browser';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';

const CALLBACK_ERROR_MESSAGES: Record<string, string> = {
  auth_failed:
    'Your sign-in link expired or was already used. Request a new one below.',
};

/**
 * Translate raw Supabase auth errors into clearer guidance. The most common
 * one in dev is the magic-link rate cap (~2/hr on the default project SMTP)
 * which surfaces as a scary "rate limit exceeded" string with no next step.
 */
function friendlyAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many sign-in links have been requested for this address in the last hour. Wait a few minutes and try again, or try a different email.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return "That email address doesn't look right — double-check the spelling.";
  }
  return raw;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Surface callback errors arriving via ?error=... (e.g. /auth/callback redirects
  // here when OTP exchange fails). Without this, users see a blank form and
  // re-submit, hitting the same dead end.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errCode = params.get('error');
    if (!errCode) return;
    const message =
      CALLBACK_ERROR_MESSAGES[errCode] ??
      'Something went wrong with your sign-in link. Please request a new one.';
    setStatus('error');
    setErrorMsg(message);
    // Strip the ?error param so a page refresh doesn't re-trigger the banner.
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState(null, '', url.toString());
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus('error');
      setErrorMsg(friendlyAuthError(error.message));
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Quiet wordmark at top — anchors the page */}
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 sm:px-10">
        <Link
          href="/"
          aria-label="The Policy Place — home"
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
                <SentState email={email} onReset={() => setStatus('idle')} />
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
  status,
  errorMsg,
  onSubmit,
}: {
  email: string;
  setEmail: (v: string) => void;
  status: 'idle' | 'sending' | 'sent' | 'error';
  errorMsg: string;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <>
      <p className="caps text-[0.65rem] font-semibold text-seal-deep">Certificate Portal</p>
      <h1 className="font-display mt-3 text-[2.1rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3.25rem]">
        Sign in to <em className="not-italic text-brand">request</em> a certificate.
      </h1>
      <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-ink-muted">
        We'll send a secure link to your inbox. No password — just one click and you're in.
      </p>

      <form onSubmit={onSubmit} className="mt-10 space-y-7">
        <div>
          <label htmlFor="email" className="caps block text-[0.62rem] font-semibold text-ink-muted">
            Email address
          </label>
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
        </div>

        {status === 'error' && (
          <p className="text-sm leading-relaxed text-danger">
            {errorMsg}
          </p>
        )}

        <div>
          <button
            type="submit"
            disabled={status === 'sending'}
            className="focus-ring group inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span>{status === 'sending' ? 'Sending link…' : 'Send magic link'}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="caps mt-4 text-[0.6rem] font-medium text-ink-faint">
            No account?{' '}
            <Link href="/signup" className="text-brand underline-offset-4 hover:underline">
              Request access →
            </Link>
          </p>
        </div>
      </form>
    </>
  );
}

function SentState({ email, onReset }: { email: string; onReset: () => void }) {
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
        We sent a one-click sign-in link to
      </p>
      <p className="mt-2 break-all font-mono text-base font-medium text-ink">{email}</p>

      <div className="mt-10 space-y-2">
        <p className="caps text-[0.6rem] font-medium text-ink-faint">Link expires in 1 hour</p>
        <button
          onClick={onReset}
          className="focus-ring text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Use a different email →
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
