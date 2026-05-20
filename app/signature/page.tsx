import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

/**
 * Preview page for Brook's extracted signature. Server-side reads the PNG
 * from /assets (which isn't in /public, so it doesn't leak as a static URL)
 * and inlines it as a base64 data URI for visual inspection only.
 */
export default async function SignaturePreview() {
  const file = path.join(process.cwd(), 'assets', 'policy-place-signature.png');
  let dataUri: string | null = null;
  let error: string | null = null;

  try {
    const buf = await readFile(file);
    dataUri = `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-8 pb-24 pt-10 sm:px-12 sm:pt-12 lg:px-20 lg:pt-16 xl:px-32">
      <div className="mx-auto max-w-2xl">
        <p className="caps text-[0.65rem] font-semibold text-seal-deep">Asset preview</p>
        <h1 className="font-display mt-3 text-[2.25rem] font-medium leading-[1.05] tracking-display text-ink">
          Brook's signature
        </h1>
        <p className="mt-3 font-mono text-[0.78rem] text-ink-muted">
          assets/policy-place-signature.png · extracted from a prior Sheffer COI
        </p>

        <div className="mt-10 border border-hairline bg-card p-8">
          {dataUri ? (
            <>
              <p className="caps text-[0.6rem] font-medium text-ink-faint">On cream (page background)</p>
              <div className="mt-3 flex items-center justify-center bg-paper p-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="Brook Gaudy signature" className="max-h-32" />
              </div>

              <p className="caps mt-10 text-[0.6rem] font-medium text-ink-faint">On white (ACORD form background)</p>
              <div className="mt-3 flex items-center justify-center bg-white p-10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="Brook Gaudy signature" className="max-h-32" />
              </div>

              <p className="caps mt-10 text-[0.6rem] font-medium text-ink-faint">Actual cert scale (~250px wide)</p>
              <div className="mt-3 flex items-center justify-center bg-white p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUri} alt="Brook Gaudy signature" className="w-[250px]" />
              </div>
            </>
          ) : (
            <p className="text-sm leading-relaxed text-danger">
              Couldn't load signature: <span className="font-mono">{error}</span>
            </p>
          )}
        </div>

        <p className="caps mt-8 text-[0.6rem] font-medium text-ink-faint">
          Read-only preview · file is NOT served as a public URL · server-inlined as base64
        </p>
      </div>
    </main>
  );
}
