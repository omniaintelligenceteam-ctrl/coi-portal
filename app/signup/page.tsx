'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FieldShake } from '../components/motion';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';

export default function SignupPage() {
  const [form, setForm] = useState({
    email: '',
    businessName: '',
    contactName: '',
    phone: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  // Bump on every server-side error so the email input shakes — even if
  // the same error returns twice (Tier 1 #3).
  const [errorTick, setErrorTick] = useState(0);
  useEffect(() => {
    if (status === 'error') setErrorTick((t) => t + 1);
  }, [status, errorMsg]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    const res = await fetch('/api/access-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Something went wrong.' }));
      setStatus('error');
      setErrorMsg(body.error ?? 'Something went wrong. Please try again.');
      return;
    }
    setStatus('sent');
  }

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-10 sm:px-10">
        <Link
          href="/"
          aria-label="The Policy Place — home"
          className="focus-ring -m-1 inline-flex rounded p-1"
        >
          <Logo tone="dark" />
        </Link>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-5 pb-24 pt-10 sm:px-8 sm:pt-12 lg:px-12 lg:pt-16">
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
                <SentState email={form.email} />
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <p className="caps text-[0.65rem] font-semibold text-seal-deep">Request access</p>
                <h1 className="font-display mt-3 text-[2.1rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[3.25rem]">
                  Get on the <em className="not-italic text-brand">Policy Place</em>.
                </h1>
                <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-ink-muted">
                  Tell us who you are. Brook or Wes will review and have you set up — usually
                  within one business day.
                </p>

                <form onSubmit={handleSubmit} className="mt-10 space-y-6">
                  <FieldShake errorKey={errorTick}>
                    <Field
                      id="email"
                      label="Email address"
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(v) => update('email', v)}
                      placeholder="you@company.com"
                    />
                  </FieldShake>
                  <Field
                    id="businessName"
                    label="Business name"
                    required
                    autoComplete="organization"
                    value={form.businessName}
                    onChange={(v) => update('businessName', v)}
                    placeholder="ACME Plumbing, LLC"
                  />
                  <Field
                    id="contactName"
                    label="Your name"
                    autoComplete="name"
                    value={form.contactName}
                    onChange={(v) => update('contactName', v)}
                    placeholder="Jane Doe"
                  />
                  <Field
                    id="phone"
                    label="Phone (optional)"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(v) => update('phone', v)}
                    placeholder="(270) 555-0142"
                  />

                  <div>
                    <label htmlFor="message" className="caps block text-[0.62rem] font-semibold text-ink-muted">
                      Anything we should know? (optional)
                    </label>
                    <textarea
                      id="message"
                      rows={3}
                      value={form.message}
                      onChange={(e) => update('message', e.target.value)}
                      placeholder="e.g. Referred by Bob at XYZ, need GL + WC for an upcoming contract"
                      className="field-underline mt-2 block w-full resize-y font-sans text-base text-ink"
                    />
                  </div>

                  {status === 'error' && (
                    <p className="text-sm leading-relaxed text-danger">{errorMsg}</p>
                  )}

                  <div>
                    <button
                      type="submit"
                      disabled={status === 'sending'}
                      className="focus-ring group inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-6 py-3.5 text-sm font-semibold text-white transition-all hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>{status === 'sending' ? 'Sending…' : 'Request access'}</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <p className="caps mt-4 text-[0.6rem] font-medium text-ink-faint">
                      Already approved?{' '}
                      <Link href="/login" className="text-brand underline-offset-4 hover:underline">
                        Sign in →
                      </Link>
                    </p>
                  </div>
                </form>
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

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  required,
  autoComplete,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="caps block text-[0.62rem] font-semibold text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field-underline mt-2 block w-full font-sans text-base text-ink"
      />
    </div>
  );
}

function SentState({ email }: { email: string }) {
  return (
    <div>
      <div className="inline-flex items-center gap-2 rounded-full border border-seal/30 bg-seal-soft px-3 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-seal" aria-hidden="true" />
        <span className="caps text-[0.62rem] font-semibold text-seal-deep">Request received</span>
      </div>
      <h2 className="font-display mt-5 text-[2.5rem] font-medium leading-[1.05] tracking-display text-ink">
        Thanks — we'll be in touch.
      </h2>
      <p className="mt-5 text-[0.95rem] leading-relaxed text-ink-muted">
        Brook or Wes will review your request and reach out at{' '}
        <span className="font-mono text-ink">{email}</span>, usually within one business day.
      </p>
      <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-muted">
        Need it sooner?{' '}
        <a className="font-medium text-brand underline-offset-4 hover:underline" href="tel:+12704102015">
          (270) 410-2015
        </a>
        .
      </p>
      <div className="mt-10">
        <Link
          href="/"
          className="focus-ring caps text-[0.62rem] font-semibold text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Back home
        </Link>
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
