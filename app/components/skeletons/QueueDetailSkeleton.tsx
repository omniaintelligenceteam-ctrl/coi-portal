/**
 * QueueDetailSkeleton — silhouette for app/admin/queue/[id]/page.tsx
 *
 * Mirrors the real two-column layout: full-width document-style header
 * (cert number display), then on xl+ a 1fr / 560px grid with left column
 * (ReviewerCard, two PartyCards, three coverage list rows, decision form)
 * and a right sticky PDF preview frame. 1.5s breathing opacity, disabled
 * under reduced-motion. Three coverage rows — typical request size.
 */

const COVERAGES = 3;

export function QueueDetailSkeleton() {
  return (
    <>
      <style>{`
        @keyframes editorial-breath {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 0.85; }
        }
        .editorial-skel {
          background: var(--color-paper-deep);
          animation: editorial-breath 1.5s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .editorial-skel { animation: none; opacity: 0.7; }
        }
      `}</style>

      <main
        className="mx-auto w-full max-w-6xl px-6 pb-24 pt-8 sm:px-10 sm:pt-10 lg:px-16 lg:pt-12 xl:px-24"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Back link */}
        <div className="editorial-skel h-3 w-28 rounded-[3px]" />

        {/* Document-style header */}
        <header className="mt-8">
          <div className="editorial-skel h-3 w-44 rounded-[3px]" />
          <div className="editorial-skel mt-3 h-10 w-72 rounded-[4px] sm:h-12 sm:w-96" />
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="editorial-skel h-6 w-20 rounded-full" />
            <div className="editorial-skel h-3 w-24 rounded-[3px]" />
            <div className="editorial-skel h-3 w-40 rounded-[3px]" />
            <div className="editorial-skel h-3 w-32 rounded-[3px]" />
          </div>
        </header>

        <div className="mt-10 h-px w-full bg-hairline" />

        {/* Two-column split */}
        <div className="mt-10 grid grid-cols-1 gap-12 xl:grid-cols-[minmax(0,1fr),minmax(0,560px)]">
          <div className="min-w-0">
            {/* Reviewer card */}
            <section>
              <div className="border border-hairline bg-card px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <div className="editorial-skel h-2 w-2 rounded-full" />
                    <div className="editorial-skel h-3 w-40 rounded-[3px]" />
                  </div>
                  <div className="editorial-skel h-3 w-20 rounded-[3px]" />
                </div>
                <div className="editorial-skel mt-4 h-3.5 w-full rounded-[3px]" />
                <div className="editorial-skel mt-2 h-3.5 w-5/6 rounded-[3px]" />
                <div className="editorial-skel mt-2 h-3.5 w-3/4 rounded-[3px]" />
              </div>
            </section>

            {/* Insured + Holder */}
            <section className="mt-12 grid grid-cols-1 gap-10 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i}>
                  <div className="editorial-skel h-3 w-20 rounded-[3px]" />
                  <div className="editorial-skel mt-3 h-7 w-3/4 rounded-[3px]" />
                  <div className="editorial-skel mt-3 h-3 w-2/3 rounded-[3px]" />
                  <div className="editorial-skel mt-1.5 h-3 w-1/2 rounded-[3px]" />
                </div>
              ))}
            </section>

            {/* Coverages */}
            <section className="mt-14">
              <div className="mb-6 flex items-center gap-3">
                <div className="editorial-skel h-3 w-36 rounded-[3px]" />
                <div className="h-px flex-1 bg-hairline" />
              </div>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {Array.from({ length: COVERAGES }).map((_, i) => (
                  <li key={i} className="py-5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <div className="editorial-skel h-5 w-44 rounded-[3px]" />
                      <div className="editorial-skel h-2.5 w-8 rounded-[3px]" />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                      <div className="editorial-skel h-3 w-36 rounded-[3px]" />
                      <div className="editorial-skel h-3 w-24 rounded-[3px]" />
                      <div className="editorial-skel h-3 w-40 rounded-[3px]" />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Decision form silhouette */}
            <section className="mt-14">
              <div className="border border-hairline bg-card px-6 py-6">
                <div className="editorial-skel h-3 w-24 rounded-[3px]" />
                <div className="editorial-skel mt-4 h-11 w-full rounded-md" />
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <div className="editorial-skel h-11 w-32 rounded-md" />
                  <div className="editorial-skel h-11 w-28 rounded-md" />
                </div>
              </div>
            </section>
          </div>

          {/* Right column: PDF preview */}
          <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
            <div className="mb-4 flex items-center gap-3">
              <div className="editorial-skel h-3 w-24 rounded-[3px]" />
              <div className="h-px flex-1 bg-hairline" />
            </div>
            <div className="border border-hairline bg-card">
              <div className="editorial-skel block h-[60vh] min-h-[400px] w-full xl:h-[760px]" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="editorial-skel h-3 w-72 rounded-[3px]" />
              <div className="editorial-skel h-8 w-24 rounded-md" />
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
