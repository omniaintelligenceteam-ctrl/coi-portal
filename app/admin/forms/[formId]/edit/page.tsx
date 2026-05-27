import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadFormDef } from '@/lib/forms/loadFormDef';
import {
  COI_ARCHIVE_BUCKET,
  formAnchorsStoragePath,
} from '@/lib/storage';
import type { AnchorLabel } from '@/lib/forms/drawCore';
import { MapperShell } from './MapperShell';

export const dynamic = 'force-dynamic';

/**
 * Visual mapper for a single form. Server-loads the FormDef + signed URLs
 * for the rasterized PNG, plus pre-parses the anchors JSON so the client
 * canvas can render label overlays without an extra fetch.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const SIGNED_URL_TTL = 60 * 30;

export default async function FormEditPage({
  params,
}: {
  params: Promise<{ formId: string }>;
}) {
  const { formId: raw } = await params;
  const formId = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) redirect('/');

  const admin = createAdminClient();
  const formDef = await loadFormDef(admin, formId);
  if (!formDef) notFound();

  // Sign URLs for PNG (background) — anchors loaded server-side and shipped
  // as initial props.
  const [{ data: pngSignedRaw }, anchorsDownload] = await Promise.all([
    admin.storage
      .from(COI_ARCHIVE_BUCKET)
      .createSignedUrl(formDef.templatePngPath, SIGNED_URL_TTL),
    admin.storage.from(COI_ARCHIVE_BUCKET).download(formAnchorsStoragePath(formId)),
  ]);

  const pngSignedUrl = pngSignedRaw?.signedUrl ?? null;

  let anchors: AnchorLabel[] = [];
  if (anchorsDownload.data) {
    try {
      const parsed = JSON.parse(await anchorsDownload.data.text()) as { labels: AnchorLabel[] };
      anchors = parsed.labels ?? [];
    } catch {
      // Legacy form (e.g., ACORD_25 registered in code) — anchors not in storage.
      // The mapper still works for editing field defs, just without label overlays.
      anchors = [];
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-var(--header-height-sm))] flex-col">
      <div className="border-b border-hairline px-5 py-4 sm:px-8 sm:py-5">
        <Link
          href="/admin/forms"
          className="focus-ring caps -m-1 inline-flex items-center gap-1.5 rounded p-1 text-[0.6rem] font-medium tracking-[0.18em] text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          Back to forms
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="caps font-mono text-[0.6rem] font-semibold tracking-[0.18em] text-brand">
              {formId.replace('_', ' ')} · {formDef.revision} · {formDef.status}
            </p>
            <h1 className="font-display mt-1 text-[1.5rem] font-medium leading-tight tracking-tight text-ink">
              {formDef.displayName}
            </h1>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MapperShell
          formDef={formDef}
          pngSignedUrl={pngSignedUrl}
          anchors={anchors}
        />
      </div>
    </div>
  );
}
