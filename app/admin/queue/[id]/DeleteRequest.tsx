'use client';

import { useState, useTransition } from 'react';
import { deleteCertRequest } from './actions';

export function DeleteRequest({
  requestId,
  certNumber,
}: {
  requestId: string;
  certNumber: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="focus-ring caps inline-flex items-center gap-1.5 rounded-md border border-danger/30 bg-white px-3 py-2 text-[0.62rem] font-semibold text-danger transition-colors hover:border-danger hover:bg-danger-soft/40"
      >
        Delete request
      </button>
    );
  }

  return (
    <form
      action={(fd: FormData) => {
        startTransition(async () => {
          await deleteCertRequest(fd);
        });
      }}
      className="flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger-soft/30 px-4 py-3"
    >
      <input type="hidden" name="id" value={requestId} />
      <p className="text-[0.85rem] text-ink">
        Permanently delete <span className="font-mono font-semibold">{certNumber}</span>?
      </p>
      <button
        type="submit"
        disabled={isPending}
        className="focus-ring caps inline-flex items-center rounded-md bg-danger px-3 py-1.5 text-[0.62rem] font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? 'Deleting…' : 'Yes, delete'}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="focus-ring caps inline-flex items-center rounded-md border border-hairline-strong bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40"
      >
        Cancel
      </button>
    </form>
  );
}
