import { FileSearch, Home } from 'lucide-react';
import { Logo } from './components/Logo';
import { ButtonLink, Card } from './components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <div className="mx-auto w-full max-w-5xl px-6 pt-safe sm:px-10">
        <div className="mt-6 inline-flex sm:mt-8">
          <Logo tone="dark" />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-6 pb-16 pt-10 sm:px-10 sm:pt-12 lg:px-16 xl:px-24">
        <Card padding="lg" raised className="relative w-full max-w-xl overflow-hidden text-center">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-seal/15"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full border border-seal/20 bg-seal-soft/30"
          />

          <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-hairline-strong bg-paper">
            <FileSearch className="h-6 w-6 text-ink-muted" aria-hidden="true" />
          </div>
          <p className="relative caps text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
            404 · Not found
          </p>
          <h1 className="font-display relative mt-3 text-[1.75rem] font-medium leading-[1.1] tracking-display text-ink sm:text-[2.25rem]">
            We can&apos;t place that page.
          </h1>
          <p className="relative mx-auto mt-3 max-w-[40ch] text-[0.9375rem] leading-[1.55] text-ink-muted">
            The page or certificate you&apos;re looking for isn&apos;t on file. Double-check the
            link, or head back home.
          </p>
          <div className="relative mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row sm:gap-3">
            <ButtonLink
              href="/"
              leadingIcon={<Home className="h-4 w-4" aria-hidden="true" />}
            >
              Back home
            </ButtonLink>
            <ButtonLink href="/certificates" variant="secondary">
              My certificates
            </ButtonLink>
          </div>
        </Card>
      </main>
    </div>
  );
}
