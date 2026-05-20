/**
 * CertificatesListSkeleton — silhouette for app/certificates/page.tsx
 *
 * Editorial skeleton: paper-deep blocks on paper background, hairline borders,
 * no shimmer. A 1.5s breathing opacity pulse (0.5 → 0.85 → 0.5), disabled
 * under prefers-reduced-motion. Mirrors the real layout: caps eyebrow +
 * display headline + count, then mobile cards (under sm) or a desktop table
 * (sm+). Three placeholder rows — matches the average "real" feel without
 * looking arbitrary.
 */

const ROWS = 3;

export function CertificatesListSkeleton() {
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
        className="mx-auto max-w-5xl px-8 pb-24 pt-12 sm:px-12 lg:px-20 lg:pt-16 xl:px-32"
        aria-busy="true"
        aria-live="polite"
      >
        {/* Back link silhouette */}
        <div className="editorial-skel h-3 w-24 rounded-[3px]" />

        {/* Header block */}
        <header className="mt-6 mb-10">
          <div className="editorial-skel h-3 w-32 rounded-[3px]" />
          <div className="mt-3 flex flex-wrap items-baseline justify-between gap-6">
            <div className="flex-1 space-y-3">
              <div className="editorial-skel h-10 w-full max-w-[34rem] rounded-[4px]" />
              <div className="editorial-skel h-10 w-full max-w-[26rem] rounded-[4px]" />
            </div>
            <div className="editorial-skel h-4 w-20 rounded-[3px]" />
          </div>
        </header>

        {/* Mobile cards — under sm */}
        <ul className="space-y-3 sm:hidden">
          {Array.from({ length: ROWS }).map((_, i) => (
            <li
              key={i}
              className="block rounded-[8px] border border-hairline bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="editorial-skel h-4 w-32 rounded-[3px]" />
                <div className="editorial-skel h-5 w-16 rounded-full" />
              </div>
              <div className="editorial-skel mt-3 h-4 w-2/3 rounded-[3px]" />
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="editorial-skel h-3 w-16 rounded-[3px]" />
                  <div className="editorial-skel h-3 w-28 rounded-[3px]" />
                </div>
                <div className="flex items-center justify-between border-t border-dashed border-hairline pt-2">
                  <div className="editorial-skel h-3 w-10 rounded-[3px]" />
                  <div className="editorial-skel h-3 w-24 rounded-[3px]" />
                </div>
              </div>
              <div className="editorial-skel mt-4 h-11 w-full rounded-md" />
            </li>
          ))}
        </ul>

        {/* Desktop table — sm and up */}
        <div className="hidden border-y border-hairline sm:block">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-hairline">
                <th className="px-3 py-3 text-left">
                  <div className="editorial-skel h-2.5 w-20 rounded-[3px]" />
                </th>
                <th className="px-3 py-3 text-left">
                  <div className="editorial-skel h-2.5 w-14 rounded-[3px]" />
                </th>
                <th className="px-3 py-3 text-left">
                  <div className="editorial-skel h-2.5 w-12 rounded-[3px]" />
                </th>
                <th className="px-3 py-3 text-right">
                  <div className="editorial-skel ml-auto h-2.5 w-16 rounded-[3px]" />
                </th>
                <th className="px-3 py-3 text-right">
                  <div className="editorial-skel ml-auto h-2.5 w-10 rounded-[3px]" />
                </th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROWS }).map((_, i) => (
                <tr
                  key={i}
                  className="border-b border-hairline last:border-b-0"
                >
                  <td className="px-3 py-4 align-middle">
                    <div className="editorial-skel h-3 w-32 rounded-[3px]" />
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="editorial-skel h-3.5 w-48 rounded-[3px]" />
                  </td>
                  <td className="px-3 py-4 align-middle">
                    <div className="editorial-skel h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-3 py-4 align-middle text-right">
                    <div className="editorial-skel ml-auto h-3 w-28 rounded-[3px]" />
                  </td>
                  <td className="px-3 py-4 align-middle text-right">
                    <div className="editorial-skel ml-auto h-3 w-24 rounded-[3px]" />
                  </td>
                  <td className="py-4 pl-3 pr-2 text-right align-middle">
                    <div className="editorial-skel ml-auto h-3 w-12 rounded-[3px]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Hairline footer */}
        <div className="mt-16 h-px w-full bg-hairline" />
        <div className="editorial-skel mt-5 h-2.5 w-72 rounded-[3px]" />
      </main>
    </>
  );
}
