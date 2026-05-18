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

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

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
