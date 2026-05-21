import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * Sticky bottom action bar for primary CTAs on mobile (and desktop forms).
 * Sits above the safe area. Use as the last child inside a page container.
 *
 * Pass `mobileOnly` to hide on >= md (when a form has space for inline CTAs
 * at the bottom of the page on desktop).
 */
export function ActionBar({
  children,
  context,
  mobileOnly = false,
  className,
}: {
  children: ReactNode;
  context?: ReactNode;
  mobileOnly?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'action-bar -mx-6 sm:-mx-10 lg:-mx-16 xl:-mx-24',
        mobileOnly && 'md:hidden',
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-6 sm:px-10 lg:px-16 xl:px-24">
        {context && (
          <div className="text-[0.75rem] leading-[1.4] text-ink-muted">{context}</div>
        )}
        <div className="flex items-center gap-2.5 sm:gap-3">{children}</div>
      </div>
    </div>
  );
}
