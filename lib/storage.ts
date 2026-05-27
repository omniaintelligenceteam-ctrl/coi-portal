/**
 * Storage helpers. Mints signed URLs for the private `coi-archive` bucket and
 * builds human-readable PDF filenames so downloads land in inboxes/desktops
 * with a meaningful name.
 *
 * Always mint signed URLs with the service-role admin client — the bucket has
 * no read policy for authenticated users (E&O isolation).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const COI_ARCHIVE_BUCKET = 'coi-archive';

/**
 * Default signed-URL TTL is short on purpose: most callers mint signed URLs for
 * in-app previews/downloads that are consumed immediately, so a long-lived link
 * just widens the leak window if it's ever logged or forwarded.
 *
 * Use EMAIL_ATTACHMENT_TTL_SECONDS only when a link must survive in an inbox as
 * a fallback (e.g., the email-attachment send path when the actual PDF attach
 * fails). Pass it explicitly via `ttlSeconds` — never bump the default.
 */
export const DEFAULT_TTL_SECONDS = 60 * 15; // 15 min for in-app previews
export const EMAIL_ATTACHMENT_TTL_SECONDS = 60 * 60 * 24; // 24h for email-embedded links (fallback if attachment fails)

export type SignedUrlOptions = {
  ttlSeconds?: number;
  /** When set, sets Content-Disposition: attachment; filename="..." on the download. */
  downloadFilename?: string;
};

export async function createCertSignedUrl(
  admin: SupabaseClient,
  path: string,
  options: SignedUrlOptions = {},
): Promise<string> {
  const ttl = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const downloadOpt = options.downloadFilename
    ? { download: options.downloadFilename }
    : undefined;

  const { data, error } = await admin.storage
    .from(COI_ARCHIVE_BUCKET)
    .createSignedUrl(path, ttl, downloadOpt);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Failed to mint signed URL for ${path}: ${error?.message ?? 'no signedUrl returned'}`,
    );
  }
  return data.signedUrl;
}

/**
 * Storage paths for an uploaded form template. The Visual Mapper writes:
 *   templates/<formId>/template.pdf  — original upload, used for re-rasterize
 *   templates/<formId>/page-<n>.png  — rasterized page background, used by the
 *                                      mapper canvas AND as the renderer overlay
 *   templates/<formId>/anchors.json  — extracted text labels, used by the mapper
 *                                      to surface clickable anchor targets
 *
 * Same coi-archive bucket as issued certs — kept private, signed URLs only.
 */
export function formTemplateStoragePath(formId: string): string {
  return `templates/${formId}/template.pdf`;
}

export function formPagePngStoragePath(formId: string, page: number): string {
  return `templates/${formId}/page-${page}.png`;
}

export function formAnchorsStoragePath(formId: string): string {
  return `templates/${formId}/anchors.json`;
}

/**
 * Builds a filename humans actually want to see in their downloads folder.
 * e.g. ACORD25_Sheffer-Construction_2026-05-18_PP-20260518-0001.pdf
 */
export function buildCertFilename(
  certNumber: string,
  holderName: string,
  isoDate?: string,
): string {
  const slug = holderName
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-');
  const date = (isoDate ?? new Date().toISOString()).slice(0, 10);
  const safeSlug = slug || 'Holder';
  return `ACORD25_${safeSlug}_${date}_${certNumber}.pdf`;
}
