'use client';

import { useRouter } from 'next/navigation';

const PREFILL_KEY = 'coi-holder-prefill';

export function ReissueButton({
  name,
  address1,
  address2,
}: {
  name: string;
  address1: string;
  address2: string;
}) {
  const router = useRouter();

  function handleClick() {
    localStorage.setItem(PREFILL_KEY, JSON.stringify({ name, address1, address2 }));
    router.push('/');
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="focus-ring caps inline-flex items-center gap-1 rounded px-2 py-1 text-[0.62rem] font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100 hover:bg-brand-soft/40"
    >
      Re-issue
    </button>
  );
}
