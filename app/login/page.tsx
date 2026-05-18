'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';

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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      {/* Brand mark */}
      <div className="mb-10 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#001842] shadow-lg mb-5">
          <ShieldIcon className="h-8 w-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">The Policy Place</h1>
        <p className="mt-1.5 text-sm text-slate-500">Certificate of Insurance Portal</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-2xl bg-white border border-slate-200 shadow-sm p-8">
        {status === 'sent' ? (
          <div className="text-center py-2">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-green-100 mb-4">
              <MailIcon className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Check your email</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              We sent a magic link to{' '}
              <span className="font-semibold text-slate-900">{email}</span>.
              Click the link to sign in.
            </p>
            <p className="mt-1 text-xs text-slate-400">Link expires in 1 hour.</p>
            <button
              onClick={() => setStatus('idle')}
              className="mt-6 text-sm font-medium text-kyblue-500 hover:text-kyblue-600 transition-colors"
            >
              Use a different email →
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">
                We&apos;ll send a secure link to your inbox.
              </p>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-2 focus:ring-kyblue-200 transition-colors"
              />
            </div>

            {status === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-kyblue-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-kyblue-600 focus:outline-none focus:ring-2 focus:ring-kyblue-500 focus:ring-offset-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
          </form>
        )}
      </div>

      <p className="mt-8 text-xs text-slate-400 text-center">
        The Policy Place · 908 Poplar St, Benton, KY 42025
      </p>
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}

function MailIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
