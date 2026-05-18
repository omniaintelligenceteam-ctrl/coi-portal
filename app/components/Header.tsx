export function Header({ email, badge }: { email: string; badge?: string }) {
  return (
    <header className="bg-[#000c21] border-b border-[#001842]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-kyblue-700">
            <ShieldIcon className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-semibold text-white tracking-tight">
            The Policy Place
          </span>
          {badge && (
            <span className="rounded-full bg-kyblue-800 border border-kyblue-700 px-2.5 py-0.5 text-xs font-medium text-kyblue-300">
              {badge}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400">{email}</span>
      </div>
    </header>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}
