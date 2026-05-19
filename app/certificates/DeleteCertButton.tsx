'use client';

import { useState, useTransition } from 'react';
import { deleteOwnCertRequest } from './actions';

export function DeleteCertButton({
  requestId,
  certNumber,
  size = 'sm',
}: {
  requestId: string;
  certNumber: string;
  size?: 'sm' | 'md';
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  const triggerCls =
    size === 'md'
      ? 'tap-target w-full justify-center px-4 py-3 text-[0.7rem]'
      : 'px-2.5 py-1.5 text-[0.62rem]';

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete request ${certNumber}`}
        className={`focus-ring caps inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-white font-semibold text-danger transition-colors hover:border-danger hover:bg-danger-soft/40 ${triggerCls}`}
      >
        Delete
      </button>
    );
  }

  return (
    <form
      action={(fd: FormData) => {
        startTransition(async () => {
          await deleteOwnCertRequest(fd);
        });
      }}
      className={
        size === 'md'
          ? 'flex w-full items-center gap-1.5'
          : 'inline-flex items-center gap-1.5'
      }
    >
      <input type="hidden" name="id" value={requestId} />
      <button
        type="submit"
        disabled={isPending}
        className={`focus-ring caps inline-flex items-center justify-center rounded-md bg-danger font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60 ${
          size === 'md' ? 'flex-1 px-3 py-3 text-[0.7rem]' : 'px-2.5 py-1.5 text-[0.62rem]'
        }`}
      >
        {isPending ? '…' : 'Confirm delete'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className={`focus-ring caps inline-flex items-center justify-center rounded-md border border-hairline-strong bg-white font-semibold text-ink transition-colors hover:bg-paper-deep/40 ${
          size === 'md' ? 'px-3 py-3 text-[0.7rem]' : 'px-2 py-1.5 text-[0.62rem]'
        }`}
      >
        Cancel
      </button>
    </form>
  );
}
