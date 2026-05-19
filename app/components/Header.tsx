import Link from 'next/link';
import { Logo } from './Logo';

export function Header({
  email,
  badge,
  showMyCerts = false,
}: {
  email: string;
  badge?: string;
  showMyCerts?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:gap-6 sm:px-8 sm:py-5">
        <Link
          href="/"
          className="focus-ring -m-1 rounded-md p-1"
          aria-label="The Policy Place — home"
        >
          <Logo tone="dark" />
        </Link>

        <div className="flex items-center gap-3">
          {badge && (
            <span className="caps inline-flex items-center gap-1.5 rounded-full border border-seal/30 bg-seal-soft px-2.5 py-0.5 text-[0.62rem] font-semibold text-seal-deep">
              <span className="h-1 w-1 rounded-full bg-seal" aria-hidden="true" />
              {badge}
            </span>
          )}
          {email && (
            <span className="hidden font-mono text-[0.72rem] text-ink-muted md:inline">
              {email}
            </span>
          )}
          {showMyCerts && (
            <Link
              href="/certificates"
              aria-label="My certificates"
              className="focus-ring tap-target inline-flex items-center justify-center gap-1.5 rounded-md border border-hairline-strong bg-white px-3 text-[0.62rem] font-semibold text-ink transition-colors hover:bg-paper-deep/40"
            >
              <CertIcon className="h-3.5 w-3.5 text-ink-muted" />
              <span className="caps hidden sm:inline">My certificates</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function CertIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 5h16v11H4V5zm4 14l4-3 4 3M8 9h8M8 12h5"
      />
    </svg>
  );
}
