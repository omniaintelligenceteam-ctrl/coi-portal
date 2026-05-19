'use client';

import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import { type ReactNode } from 'react';

/**
 * Soft crossfade between routes. Replaces the layout's static page wrapper
 * with a motion.div keyed on pathname — when the route changes, React
 * remounts the subtree and the new page fades in over 180ms.
 *
 * Keep duration short. This is meant to feel like "this app is in motion,"
 * not like a slideshow.
 *
 * Short-circuits to a static wrapper under prefers-reduced-motion.
 */
export function RouteTransition({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
