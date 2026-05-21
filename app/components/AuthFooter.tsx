import { Hairline } from './Hairline';
import { PageShell } from './ui/PageShell';

/**
 * Shared address + contact footer for the public auth surfaces (login, signup,
 * pending-access screens). Editorial caps, hairline divider, two-column at sm+.
 */
export function AuthFooter() {
  return (
    <PageShell as="footer" className="pb-8 pb-safe">
      <Hairline />
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="caps text-[0.65rem] font-medium tracking-[0.18em] text-ink-faint">
          The Policy Place &middot; 908 Poplar St &middot; Benton KY 42025
        </p>
        <p className="caps flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] font-medium tracking-[0.18em] text-ink-faint">
          <a href="tel:+12704102015" className="text-ink-muted hover:text-ink">
            (270) 410-2015
          </a>
          <span aria-hidden="true" className="text-ink-faint/60">
            &middot;
          </span>
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
    </PageShell>
  );
}
