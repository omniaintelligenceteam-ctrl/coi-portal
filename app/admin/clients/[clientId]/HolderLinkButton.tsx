'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Link2 } from 'lucide-react';

/**
 * Get-or-create the client's public holder request link and copy it to the
 * clipboard. Lives in the client detail header.
 */
export function HolderLinkButton({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/holder-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        url?: string;
        error?: string;
      };
      if (!res.ok || !payload.ok || !payload.url) {
        toast.error(payload.error || `Couldn't create the link (${res.status}).`);
        return;
      }
      await navigator.clipboard.writeText(payload.url);
      toast.success('Holder request link copied — share it with any certificate holder.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="focus-ring caps inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-white px-3 py-1.5 text-[0.62rem] font-semibold text-brand transition-colors hover:bg-brand-soft/40 disabled:opacity-60"
    >
      <Link2 className="h-3 w-3" aria-hidden="true" />
      {busy ? 'Copying…' : 'Copy holder request link'}
    </button>
  );
}
