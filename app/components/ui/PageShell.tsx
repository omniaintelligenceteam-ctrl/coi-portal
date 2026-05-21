import type { ReactNode } from 'react';
import { cn } from './cn';

type Width = 'default' | 'narrow' | 'wide';

const maxes: Record<Width, string> = {
  narrow: 'max-w-3xl',
  default: 'max-w-6xl',
  wide: 'max-w-7xl',
};

/**
 * Canonical page container. Owns max-width + horizontal padding for every
 * top-level surface (sticky header, tab strip, page body, footer).
 *
 * Never inline `mx-auto max-w-... px-...` recipes again — route through this.
 * Width / padding tweaks happen here and ship to every page on the next build.
 */
export function PageShell({
  as: Tag = 'div',
  width = 'default',
  className,
  children,
}: {
  as?: 'div' | 'main' | 'header' | 'nav' | 'section' | 'footer';
  width?: Width;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'mx-auto w-full px-6 sm:px-10 lg:px-16 xl:px-24',
        maxes[width],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
