'use client';

/**
 * Conversational COI agent — client-facing widget.
 *
 * Mounted on /page.tsx (the insured's home). Floating circular trigger in
 * the bottom-right; tapping expands a panel with a message thread + input.
 * On mobile the panel is a bottom sheet. On desktop it's a 400x600 card.
 *
 * Conversation state lives in component-local state for the session — no
 * DB persistence (yet). Posts to /api/chat which handles tool execution
 * server-side and returns the new turns to render.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Send, X, Loader2 } from 'lucide-react';

type UserContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'tool_result'; tool_use_id: string; content: string }
    >;

type AssistantContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
    >;

type Turn =
  | { role: 'user'; content: UserContent }
  | { role: 'assistant'; content: AssistantContent };

const INITIAL_TURNS: Turn[] = [
  {
    role: 'assistant',
    content:
      "Hi — I can pull together a Certificate of Insurance for you. Who's the cert for? (the company or person it needs to be issued to)",
  },
];

export function ChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>(INITIAL_TURNS);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest turn whenever it changes.
  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    const next: Turn[] = [...turns, { role: 'user', content: trimmed }];
    setTurns(next);
    setInput('');
    setPending(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        text?: string;
        newTurns?: Turn[];
        error?: string;
        detail?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.detail || payload.error || `Request failed (${res.status}).`);
        return;
      }
      const newTurns = payload.newTurns ?? [];
      setTurns((prev) => [...prev, ...newTurns]);
      // If the agent submitted a cert, refresh the home so the pending banner
      // + recent certs feed update.
      if (newTurns.some((t) => containsSubmitToolUse(t))) {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setPending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Floating trigger */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat assistant"
          className="focus-ring fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 text-[0.875rem] font-medium text-white shadow-lift transition-transform duration-150 hover:bg-brand-deep hover:-translate-y-0.5"
        >
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Ask the assistant
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Conversational COI assistant"
          className="fixed inset-0 z-30 flex items-end justify-end p-0 sm:items-end sm:justify-end sm:p-6"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/30 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-[88dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-[var(--r-xl)] border border-hairline-strong bg-card shadow-lift sm:h-[600px] sm:rounded-[var(--r-lg)] slide-up">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-[0.7rem] font-semibold text-white">
                  P
                </span>
                <div className="min-w-0">
                  <p className="text-[0.875rem] font-medium leading-[1.2] text-ink">
                    Policy Place assistant
                  </p>
                  <p className="text-[0.72rem] text-ink-faint">
                    Issues certs on Brook's behalf
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close chat"
                onClick={() => setOpen(false)}
                className="focus-ring -m-1 rounded p-1 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Messages */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
              <ul className="flex flex-col gap-3">
                {turns.map((t, i) => (
                  <li key={i} className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                    <TurnBubble turn={t} />
                  </li>
                ))}
                {pending && (
                  <li className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-hairline bg-paper-deep px-3 py-2 text-[0.85rem] text-ink-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Thinking
                    </div>
                  </li>
                )}
              </ul>
            </div>

            {error && (
              <p
                role="alert"
                className="border-t border-danger/40 bg-danger-soft px-4 py-2 text-[0.78rem] leading-[1.4] text-danger"
              >
                {error}
              </p>
            )}

            {/* Input */}
            <div className="border-t border-hairline bg-card px-3 py-3 pb-safe">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  placeholder="Tell me about the cert you need…"
                  rows={1}
                  disabled={pending}
                  className="field-box max-h-32 flex-1 resize-none rounded-[var(--r-md)] text-[0.95rem]"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={!input.trim() || pending}
                  aria-label="Send"
                  className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-md)] bg-brand text-white transition-colors hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="caps mt-1.5 text-center text-[0.55rem] tracking-caps text-ink-faint">
                Brook reviews every cert · Enter to send
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* --------- bubbles --------- */

function TurnBubble({ turn }: { turn: Turn }) {
  // user: plain text or tool_result blocks — we only render the text portion;
  // tool_result blocks aren't shown to the user (they're chat protocol noise).
  if (turn.role === 'user') {
    const text = typeof turn.content === 'string'
      ? turn.content
      : turn.content
          .map((b) => (b.type === 'text' ? b.text : ''))
          .filter(Boolean)
          .join('\n');
    if (!text) return null;
    return (
      <div className="max-w-[80%] rounded-[var(--r-md)] bg-brand px-3.5 py-2 text-[0.95rem] leading-[1.4] text-white">
        {text}
      </div>
    );
  }

  // assistant: text blocks + optional tool_use blocks (rendered as a small
  // hint pill so the user knows the assistant is "looking something up").
  const blocks = typeof turn.content === 'string'
    ? [{ type: 'text' as const, text: turn.content }]
    : turn.content;

  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {blocks.map((b, i) => {
        if (b.type === 'text' && b.text.trim().length > 0) {
          return (
            <div
              key={i}
              className="rounded-[var(--r-md)] border border-hairline bg-paper-deep/40 px-3.5 py-2 text-[0.95rem] leading-[1.5] text-ink"
            >
              {b.text}
            </div>
          );
        }
        if (b.type === 'tool_use') {
          return (
            <div
              key={i}
              className="caps inline-flex w-fit items-center gap-1.5 rounded-full border border-hairline-strong bg-card px-2 py-1 text-[0.6rem] font-semibold tracking-caps text-ink-faint"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" aria-hidden="true" />
              {humanizeToolName(b.name)}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function humanizeToolName(name: string): string {
  switch (name) {
    case 'list_my_active_policies':
      return 'Checking your coverages';
    case 'list_my_recent_holders':
      return 'Looking up recent holders';
    case 'list_my_recent_certificates':
      return 'Pulling recent certs';
    case 'submit_certificate_request':
      return 'Submitting to Brook';
    default:
      return name;
  }
}

function containsSubmitToolUse(turn: Turn): boolean {
  if (turn.role !== 'assistant') return false;
  if (typeof turn.content === 'string') return false;
  return turn.content.some(
    (b) => b.type === 'tool_use' && b.name === 'submit_certificate_request',
  );
}
