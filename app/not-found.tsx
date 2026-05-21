import { FileSearch, Home } from 'lucide-react';
import { Logo } from './components/Logo';
import { SealCorner } from './components/SealCorner';
import { ButtonLink, Card, PageShell } from './components/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageShell as="div" className="pt-safe">
        <div className="mt-6 inline-flex sm:mt-8">
          <Logo tone="dark" />
        </div>
      </PageShell>

      <PageShell
        as="main"
        width="narrow"
        className="flex flex-1 items-center justify-center page-pad-top page-pad-bot"
      >
        <Card padding="lg" raised className="relative w-full overflow-hidden text-center">
          <SealCorner size="lg" position="tr" />

          <div className="relative mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-hairline-strong bg-paper">
            <FileSearch className="h-6 w-6 text-ink-muted" aria-hidden="true" />
          </div>
          <p className="caps relative text-[0.65rem] font-semibold tracking-[0.22em] text-seal-deep">
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
      </PageShell>
    </div>
  );
}
