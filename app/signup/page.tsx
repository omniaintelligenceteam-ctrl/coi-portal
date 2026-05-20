'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { FieldShake } from '../components/motion';
import { Logo } from '../components/Logo';
import { Hairline } from '../components/Hairline';
import { Banner, Button, Card } from '../components/ui';

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
    <div className="relative flex min-h-[100dvh] flex-col">
      <div className="mx-auto w-full max-w-5xl px-8 pt-safe sm:px-12">
        <Link
          href="/"
          aria-label="The Policy Place — home"
          className="focus-ring -m-1 mt-6 inline-flex rounded p-1 sm:mt-8"
        >
          <Logo tone="dark" />
        </Link>
      </div>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-8 pb-16 pt-8 sm:px-12 sm:pt-12 lg:pt-16">
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
                <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
                  Request access
                </p>
                <h1 className="font-display mt-3 text-[1.875rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.75rem]">
                  Get on the <em className="not-italic text-brand-deep">Policy Place</em>.
                </h1>
                <p className="mt-4 max-w-md text-[0.9375rem] leading-[1.6] text-ink-muted">
                  Tell us who you are. Brook or Wes will review and have you set up — usually
                  within one business day.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
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
                    <label
                      htmlFor="message"
                      className="caps block text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted"
                    >
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

                  {status === 'error' && <Banner tone="danger">{errorMsg}</Banner>}

                  <div className="mt-2">
                    <Button
                      type="submit"
                      size="lg"
                      fullWidth
                      loading={status === 'sending'}
                      trailingIcon={
                        status !== 'sending' ? (
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        ) : null
                      }
                    >
                      {status === 'sending' ? 'Sending…' : 'Request access'}
                    </Button>
                    <p className="caps mt-4 text-[0.62rem] font-medium tracking-[0.18em] text-ink-faint">
                      Already approved?{' '}
                      <Link
                        href="/login"
                        className="text-brand-deep underline-offset-4 hover:underline"
                      >
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

      <footer className="mx-auto w-full max-w-5xl px-8 pb-8 pb-safe sm:px-12">
        <Hairline />
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="caps text-[0.65rem] font-medium tracking-[0.18em] text-ink-faint">
            The Policy Place · 908 Poplar St · Benton KY 42025
          </p>
          <p className="caps flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-faint">
            <a href="tel:+12704102015" className="text-ink-muted hover:text-ink">
              (270) 410-2015
            </a>
            <span aria-hidden="true" className="text-ink-faint/60">·</span>
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
      <label
        htmlFor={id}
        className="caps block text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted"
      >
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
    <Card padding="lg" raised tone="seal">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-seal/35 bg-card">
        <CheckCircle2 className="h-6 w-6 text-seal-deep" aria-hidden="true" />
      </div>
      <p className="caps text-[0.62rem] font-semibold tracking-[0.22em] text-seal-deep">
        Request received
      </p>
      <h2 className="font-display mt-3 text-[2rem] font-medium leading-[1.05] tracking-display text-ink sm:text-[2.5rem]">
        Thanks — we&apos;ll be in touch.
      </h2>
      <p className="mt-4 text-[0.9375rem] leading-[1.6] text-ink-muted">
        Brook or Wes will review your request and reach out at{' '}
        <span className="font-mono text-ink">{email}</span>, usually within one business day.
      </p>
      <p className="mt-3 text-[0.9375rem] leading-[1.6] text-ink-muted">
        Need it sooner?{' '}
        <a
          className="font-medium text-brand-deep underline-offset-4 hover:underline"
          href="tel:+12704102015"
        >
          (270) 410-2015
        </a>
        .
      </p>
      <div className="mt-8">
        <Link
          href="/"
          className="focus-ring caps text-[0.62rem] font-semibold tracking-[0.18em] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Back home
        </Link>
      </div>
    </Card>
  );
}
