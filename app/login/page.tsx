'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/lib/supabase/browser';
import { ShieldMark } from '../components/Logo';
import { Hairline } from '../components/Hairline';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

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
      setErrorMsg(error.message);
      return;
    }
    setStatus('sent');
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* Quiet wordmark at top — anchors the page */}
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 sm:px-10">
        <Link href="/" className="focus-ring inline-flex items-center gap-2 -m-1 rounded p-1">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand">
            <ShieldMark className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="font-display text-base font-semibold tracking-tight text-ink">
            The Policy Place
          </span>
        </Link>
      </div>

      <main className="flex flex-1 items-center justify-center px-6 py-16 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md"
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
        <p className="caps mt-5 text-[0.65rem] font-medium text-ink-faint">
          The Policy Place · Est. Kentucky · 908 Poplar St · Benton KY 42025
        </p>
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
      <h1 className="font-display mt-3 text-[2.75rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3.25rem]">
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
            Authorized clients only · No account? Contact Brook.
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
