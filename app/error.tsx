'use client';

import { useEffect } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { Logo } from './components/Logo';
import { Button, ButtonLink, Card } from './components/ui';

/**
 * Global app error boundary. Next.js wires this for unhandled exceptions
 * inside the (root) segment. Anything more granular (route-specific) can
 * still ship its own error.tsx; this is the catch-all.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="mx-auto w-full max-w-5xl px-8 pt-safe sm:px-12 lg:px-20 xl:px-32">
        <div className="mt-6 inline-flex sm:mt-8">
          <Logo tone="dark" />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-8 pb-16 pt-10 sm:px-12 sm:pt-12 lg:px-20 xl:px-32">
        <Card padding="lg" raised tone="danger" className="w-full max-w-xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-danger/40 bg-danger-soft/60">
            <AlertOctagon className="h-6 w-6 text-danger" aria-hidden="true" />
          </div>
          <p className="caps text-[0.65rem] font-semibold tracking-[0.22em] text-danger">
            Something went wrong
          </p>
          <h1 className="font-display mt-3 text-[1.75rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2.25rem]">
            Hit an unexpected snag.
          </h1>
          <p className="mx-auto mt-3 max-w-[42ch] text-[0.9375rem] leading-[1.55] text-ink-muted">
            We&apos;ve been notified. Try again, or head back home — your draft is saved locally
            and won&apos;t be lost.
          </p>
          {error.digest && (
            <p className="mt-3 font-mono text-[0.72rem] text-ink-faint">
              ref · {error.digest}
            </p>
          )}
          <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
            <Button
              onClick={reset}
              leadingIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
            >
              Try again
            </Button>
            <ButtonLink href="/" variant="secondary">
              Back home
            </ButtonLink>
          </div>
        </Card>
      </main>
    </div>
  );
}
