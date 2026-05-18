'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-fetches the server component every `intervalMs` while the cert is in
 * an in-flight state. Renders nothing.
 */
const POLLING_STATUSES = new Set(['pending', 'reviewed', 'approved', 'edited']);

export function AutoRefresh({
  status,
  intervalMs = 30000,
}: {
  status: string;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!POLLING_STATUSES.has(status)) return;
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [status, intervalMs, router]);

  return null;
}
