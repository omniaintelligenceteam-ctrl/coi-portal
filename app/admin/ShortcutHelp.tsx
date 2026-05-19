'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

type Row = { keys: string[]; label: string };

const ROWS: Row[] = [
  { keys: ['j'], label: 'Move focus down' },
  { keys: ['k'], label: 'Move focus up' },
  { keys: ['Enter'], label: 'Open focused request' },
  { keys: ['a'], label: 'Approve focused request' },
  { keys: ['r'], label: 'Reject focused request' },
  { keys: ['x'], label: 'Toggle selection' },
  { keys: ['Shift', 'A'], label: 'Approve all selected' },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['⌘', 'K'], label: 'Open command palette' },
  { keys: ['?'], label: 'Toggle this help' },
];

export function ShortcutHelp({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md border border-hairline bg-paper shadow-[var(--shadow-lift)]"
          >
            <div className="border-b border-hairline px-6 py-5">
              <p className="caps text-[0.6rem] font-semibold text-seal-deep">Reference</p>
              <h2 className="font-display mt-1 text-[1.5rem] font-medium tracking-display text-ink">
                Keyboard shortcuts
              </h2>
            </div>
            <ul className="divide-y divide-hairline px-6 py-2">
              {ROWS.map((row) => (
                <li
                  key={row.label}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <span className="text-[0.88rem] text-ink-muted">{row.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {row.keys.map((k, i) => (
                      <kbd
                        key={i}
                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-[3px] border border-hairline-strong bg-white px-1.5 font-mono text-[0.7rem] font-medium text-ink"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-hairline px-6 py-3">
              <p className="caps text-[0.6rem] font-medium text-ink-faint">
                Esc to close
              </p>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring caps rounded text-[0.6rem] font-semibold text-ink-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
