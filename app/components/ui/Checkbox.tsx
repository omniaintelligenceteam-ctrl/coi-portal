'use client';

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from './cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
  alignTop?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, alignTop = false, className, id, checked, disabled, ...rest },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `cb-${reactId}`;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'group flex cursor-pointer gap-3 rounded-md py-2 transition-colors',
        alignTop ? 'items-start' : 'items-center',
        disabled && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
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
            'inline-flex h-5 w-5 items-center justify-center rounded-[5px] border bg-card transition-all duration-150',
            'border-hairline-strong group-hover:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40',
            checked && 'border-brand bg-brand text-white shadow-card'
          )}
        >
          <Check
            className={cn(
              'h-3.5 w-3.5 stroke-[2.5] transition-opacity',
              checked ? 'opacity-100' : 'opacity-0'
            )}
            aria-hidden="true"
          />
        </span>
      </span>
      {(label || description) && (
        <span className="min-w-0 flex-1">
          {label && (
            <span className="block text-[0.875rem] font-medium leading-[1.4] text-ink">
              {label}
            </span>
          )}
          {description && (
            <span className="mt-0.5 block text-[0.8125rem] leading-[1.45] text-ink-muted">
              {description}
            </span>
          )}
        </span>
      )}
    </label>
  );
});
