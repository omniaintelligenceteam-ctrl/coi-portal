import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  leadingAdornment?: ReactNode;
  trailingAdornment?: ReactNode;
  uppercaseLabel?: boolean;
  hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leadingAdornment,
    trailingAdornment,
    uppercaseLabel = true,
    hideLabel = false,
    className,
    id,
    type = 'text',
    ...rest
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `in-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;

  return (
    <div className="block w-full">
      {label && (
        <label
          htmlFor={inputId}
          className={cn(
            'mb-1.5 block text-[0.7rem] font-semibold text-ink-muted',
            uppercaseLabel && 'caps',
            hideLabel && 'sr-only'
          )}
        >
          {label}
        </label>
      )}
      <div className="relative">
        {leadingAdornment && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex w-10 items-center justify-center text-ink-faint">
            {leadingAdornment}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={!!error || undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'field-box',
            leadingAdornment && 'pl-10',
            trailingAdornment && 'pr-10',
            className
          )}
          {...rest}
        />
        {trailingAdornment && (
          <span className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-faint">
            {trailingAdornment}
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[0.75rem] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} role="alert" className="mt-1.5 text-[0.75rem] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});
