'use client';

import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );
  const [errorMsg, setErrorMsg] = useState<string>('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
      return;
    }

    setStatus('sent');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-gray-100 px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900">
          The Policy Place
        </h1>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Certificate of Insurance Portal
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Enter your email and we&apos;ll send you a secure magic link.
          </p>
        </div>

        {status === 'sent' ? (
          <div className="rounded-md border border-kyblue-200 bg-kyblue-50 p-4">
            <p className="text-sm font-medium text-kyblue-900">
              Check your email
            </p>
            <p className="mt-1 text-sm text-kyblue-800">
              We sent a magic link to <strong>{email}</strong>. Click the link
              to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-kyblue-500 focus:outline-none focus:ring-1 focus:ring-kyblue-500"
                placeholder="you@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={status === 'sending'}
              className="rounded-md bg-kyblue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-kyblue-600 focus:outline-none focus:ring-2 focus:ring-kyblue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>

            {status === 'error' && (
              <p className="text-sm text-red-600">{errorMsg}</p>
            )}
          </form>
        )}
      </main>
    </div>
  );
}
