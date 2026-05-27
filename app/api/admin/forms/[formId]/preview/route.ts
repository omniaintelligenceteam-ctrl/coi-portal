import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderCertificateFromDb } from '@/lib/renderCertificate';
import { SYNTHETIC_COI_INPUT } from '@/lib/forms/syntheticInput';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * Render the form with synthetic CoiInput and return the PDF bytes.
 *
 * Used by the mapper UI's preview pane. Calls the data-driven renderer
 * (renderCertificateFromDb) regardless of form status — drafts must be
 * previewable so the admin can iterate while mapping fields.
 *
 * Inline Content-Disposition so browsers render the PDF in an iframe
 * rather than triggering a download.
 */

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ formId: string }> }) {
  const { formId: raw } = await params;
  const formId = decodeURIComponent(raw);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email?.toLowerCase();
  if (!email || !adminEmails().includes(email)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await renderCertificateFromDb(admin, formId, SYNTHETIC_COI_INPUT);
  } catch (err) {
    log.warn('form.preview_failed', { formId, by: email, error: (err as Error).message });
    return NextResponse.json(
      { error: 'preview render failed', detail: (err as Error).message },
      { status: 500 },
    );
  }

  return new Response(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${formId}-preview.pdf"`,
      // No cache — admin will be re-rendering after every field edit.
      'cache-control': 'no-store, max-age=0',
    },
  });
}
