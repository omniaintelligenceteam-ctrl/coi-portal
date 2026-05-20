'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  description?: ReactNode;
  size?: 'sm' | 'md';
}

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(function Toggle(
  { label, description, size = 'md', className, id, checked, disabled, ...rest },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `tg-${reactId}`;
  const trackSize = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knobSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const knobTravel = size === 'sm' ? 'translate-x-4' : 'translate-x-5';

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group flex cursor-pointer items-start justify-between gap-4 py-1.5',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="block text-[0.875rem] font-medium leading-[1.4] text-ink">{label}</span>
          )}
          {description && (
            <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-ink-muted">
              {description}
            </span>
          )}
        </span>
      )}
      <span className="relative inline-flex shrink-0 items-center pt-0.5">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...rest}
        />
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex shrink-0 rounded-full border border-hairline-strong bg-paper-deep transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40',
            trackSize,
            checked && 'border-brand bg-brand'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute left-0.5 top-1/2 inline-block -translate-y-1/2 rounded-full bg-white shadow-card transition-transform duration-200 ease-out',
              knobSize,
              checked && knobTravel
            )}
          />
        </span>
      </span>
    </label>
  );
});
