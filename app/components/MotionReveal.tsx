'use client';

import { motion, useReducedMotion, type Variants } from 'motion/react';
import { Children, type ReactNode } from 'react';

const container = (stagger: number): Variants => ({
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: stagger, delayChildren: 0.04 },
  },
});

const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

/**
 * Stagger-reveals direct children on mount.
 * Respects `prefers-reduced-motion` automatically.
 *
 * Each direct child is wrapped in a motion.div with the item variant.
 * Use as: <MotionReveal>...sections...</MotionReveal>
 */
export function MotionReveal({
  children,
  stagger = 0.06,
  as: As = 'div',
  className = '',
}: {
  children: ReactNode;
  stagger?: number;
  as?: 'div' | 'section' | 'main';
  className?: string;
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return <As className={className}>{children}</As>;
  }

  const MotionTag = motion[As] as typeof motion.div;

  return (
    <MotionTag
      className={className}
      variants={container(stagger)}
      initial="hidden"
      animate="show"
    >
      {Children.map(children, (child, i) => (
        <motion.div key={i} variants={item}>
          {child}
        </motion.div>
      ))}
    </MotionTag>
  );
}
