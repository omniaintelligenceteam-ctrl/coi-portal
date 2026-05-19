'use client';

import { useEffect } from 'react';

/**
 * Returns true when the key event originated from an editable surface
 * (input, textarea, select, or any contenteditable). Shortcuts should no-op
 * in those cases so users can type freely.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export type QueueShortcutHandlers = {
  onDown: () => void;
  onUp: () => void;
  onOpen: () => void;
  onApprove: () => void;
  onReject: () => void;
  onToggleSelect: () => void;
  onBulkApprove: () => void;
  onToggleHelp: () => void;
  onFocusSearch: () => void;
};

/**
 * Single-key shortcuts for the admin queue. Skips when the user is
 * typing into a form control. Modifier keys (Cmd/Ctrl/Alt/Meta) are
 * ignored except for Shift+A — the command palette `Ctrl+K` is wired
 * separately by CommandPalette.
 */
export function useQueueShortcuts(handlers: QueueShortcutHandlers) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Shift+A — bulk approve all selected
      if (e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        handlers.onBulkApprove();
        return;
      }

      // Any other modifier-less single key
      if (e.shiftKey) return;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          handlers.onDown();
          break;
        case 'k':
          e.preventDefault();
          handlers.onUp();
          break;
        case 'Enter':
          e.preventDefault();
          handlers.onOpen();
          break;
        case 'a':
          e.preventDefault();
          handlers.onApprove();
          break;
        case 'r':
          e.preventDefault();
          handlers.onReject();
          break;
        case 'x':
          e.preventDefault();
          handlers.onToggleSelect();
          break;
        case '?':
          e.preventDefault();
          handlers.onToggleHelp();
          break;
        case '/':
          e.preventDefault();
          handlers.onFocusSearch();
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers]);
}
