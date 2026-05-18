import Link from 'next/link';
import { Logo } from './Logo';

export function Header({ email, badge }: { email: string; badge?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5 sm:px-8">
        <Link href="/" className="focus-ring -m-1 rounded-md p-1" aria-label="The Policy Place — home">
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
            <span className="hidden font-mono text-[0.72rem] text-ink-muted sm:inline">
              {email}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
