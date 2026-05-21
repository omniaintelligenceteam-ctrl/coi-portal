'use client';

/**
 * Theme toggle — three-state segmented control: System / Light / Dark.
 *
 * Lives in the header on desktop and in the mobile drawer on mobile. The
 * "system" state is the default and respects the OS color-scheme preference;
 * explicit Light or Dark overrides persist in localStorage.
 *
 * Tight visual register — hairline-bordered pill with three small buttons.
 * The active button gets a soft brand background. No labels on the buttons
 * themselves (icons only) to keep the control compact; the label is wired
 * via aria-label.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemeMode } from './ThemeProvider';

type Option = {
  value: ThemeMode;
  label: string;
  icon: typeof Sun;
};

const OPTIONS: Option[] = [
  { value: 'system', label: 'Match system theme',     icon: Monitor },
  { value: 'light',  label: 'Light theme',            icon: Sun },
  { value: 'dark',   label: 'Dark theme',             icon: Moon },
];

export function ThemeToggle({
  size = 'sm',
  className = '',
}: {
  size?: 'sm' | 'md';
  className?: string;
}) {
  const { mode, setMode } = useTheme();

  const buttonSize = size === 'md' ? 'h-8 w-8' : 'h-7 w-7';
  const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={[
        'inline-flex items-center gap-0.5 rounded-full border border-hairline-strong bg-card p-0.5',
        className,
      ].join(' ')}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            onClick={() => setMode(opt.value)}
            className={[
              'focus-ring inline-flex items-center justify-center rounded-full transition-colors duration-150',
              buttonSize,
              active
                ? 'bg-brand text-white'
                : 'text-ink-faint hover:bg-paper-deep hover:text-ink',
            ].join(' ')}
          >
            <Icon className={iconSize} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
