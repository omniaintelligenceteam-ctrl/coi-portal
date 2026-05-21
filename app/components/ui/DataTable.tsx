import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';
import { cn } from './cn';

type Align = 'left' | 'right' | 'center';

const alignClass: Record<Align, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/**
 * Shared editorial table primitive. Replaces the four duplicated copies that
 * lived inline across queue / clients / settings / certificates. Default look:
 * rounded card frame, paper-deep header tone, hairline-divided rows, hover wash.
 *
 * Pass `frame={false}` for embedded tables that already sit in a Card.
 */
export function DataTable({
  frame = true,
  className,
  children,
}: {
  frame?: boolean;
  className?: string;
  children: ReactNode;
}) {
  if (!frame) {
    return (
      <div className={cn('w-full', className)}>
        <table className="min-w-full">{children}</table>
      </div>
    );
  }
  return (
    <div
      className={cn(
        'hidden overflow-hidden rounded-[var(--r-md)] border border-hairline bg-card shadow-card sm:block',
        className,
      )}
    >
      <table className="min-w-full">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-hairline bg-paper-deep/40">{children}</tr>
    </thead>
  );
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  className,
  hover = true,
  children,
  ...rest
}: {
  className?: string;
  hover?: boolean;
  children: ReactNode;
} & React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        'border-b border-hairline last:border-b-0 transition-colors',
        hover && 'hover:bg-paper-deep/40',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Th({
  align = 'left',
  className,
  children,
  ...rest
}: {
  align?: Align;
  children?: ReactNode;
} & ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'caps px-3 py-3 text-[0.6rem] font-semibold tracking-[0.18em] text-ink-faint',
        alignClass[align],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function Td({
  align = 'left',
  className,
  children,
  ...rest
}: {
  align?: Align;
  children?: ReactNode;
} & TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn('px-3 py-4 align-middle', alignClass[align], className)}
      {...rest}
    >
      {children}
    </td>
  );
}
