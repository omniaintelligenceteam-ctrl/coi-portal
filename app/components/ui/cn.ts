/**
 * Minimal className composer — joins truthy strings with single spaces.
 * Avoids the clsx/classnames dependency for a UI library this size.
 *
 * Accepts arbitrary inputs so `cond && 'klass'` works no matter what `cond`
 * resolves to (ReactNode, number, 0n, etc.) — only string args survive the filter.
 */
export function cn(...args: unknown[]) {
  return args.filter((a): a is string => typeof a === 'string' && a.length > 0).join(' ');
}
