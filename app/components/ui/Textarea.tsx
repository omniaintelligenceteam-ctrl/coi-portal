import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  uppercaseLabel?: boolean;
  hideLabel?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    uppercaseLabel = true,
    hideLabel = false,
    className,
    id,
    rows = 4,
    ...rest
  },
  ref
) {
  const reactId = useId();
  const inputId = id ?? `ta-${reactId}`;
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
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={!!error || undefined}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        className={cn('field-box resize-y leading-[1.5]', className)}
        {...rest}
      />
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
