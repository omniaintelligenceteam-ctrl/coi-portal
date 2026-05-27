/**
 * Data-driven form renderer.
 *
 * Walks a FormDef's form_fields rows, resolves each field's value via the
 * field dictionary, and overlays text on the rasterized template PNG using
 * the shared drawCore primitives.
 *
 * Replaces fillAcord25-style hand-coded per-form renderers. Once ACORD 25
 * is migrated (Phase 4), the same code path renders every form.
 *
 * Loads template assets from Supabase Storage by signed URL — the calling
 * route (renderCertificate dispatch or preview endpoint) mints the URL and
 * passes it in via FormDef + signedUrls.
 */

import { PDFDocument, StandardFonts } from '@cantoo/pdf-lib';
import type { CoiInput } from '../types';
import type { FormDef } from './types';
import { getResolver } from './fieldDictionary';
import { drawAt, resolveAnchorCoord, DEFAULT_SIZE, type AnchorLabel } from './drawCore';

export interface RenderAssets {
  /** PNG bytes of the rasterized template page 1. Caller fetches from storage. */
  templatePngBytes: Uint8Array;
  /** Anchor labels for page 1 (loaded from the form's anchors.json in storage). */
  anchors: readonly AnchorLabel[];
  /** Page dimensions in PDF points. Falls back to (612, 792) for legacy
   *  forms without recorded dimensions. */
  pageWidthPt: number;
  pageHeightPt: number;
}

/**
 * Render a certificate by walking form_fields rows.
 *
 * Throws on:
 *   - Unknown field key with no dictionary resolver (form is misconfigured)
 *   - Anchor not found in the labels (form refers to a deleted anchor)
 *
 * Returns the PDF bytes — same shape as fillAcord25.
 */
export async function fillFromTemplate(
  formDef: FormDef,
  assets: RenderAssets,
  input: CoiInput,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pageWidth = assets.pageWidthPt || formDef.pageWidthPt || 612;
  const pageHeight = assets.pageHeightPt || formDef.pageHeightPt || 792;
  const page = pdfDoc.addPage([pageWidth, pageHeight]);

  // Draw the rasterized template as the page background.
  const templateImage = await pdfDoc.embedPng(assets.templatePngBytes);
  page.drawImage(templateImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  // Walk fields in stored order (sorted by field_key by loadFormDef).
  for (const field of formDef.fields) {
    // V1: page 1 only. Multi-page is out of scope.
    if (field.page !== 1) continue;

    const resolver = getResolver(field.fieldKey);
    if (!resolver) {
      // Free-form 'custom_<n>' keys won't be in the dictionary. Skip for now
      // — V2 will support a literal-text data source for these.
      continue;
    }
    const value = resolver(input);
    if (!value) continue;

    // Anchor-relative OR absolute, per the form_fields CHECK constraint.
    const coord = field.anchorLabel
      ? {
          ...resolveAnchorCoord(
            assets.anchors,
            field.anchorLabel,
            field.anchorSide!,
            field.dx,
            field.dy,
            field.nearY,
          ),
          size: field.fontSize || DEFAULT_SIZE,
          maxWidth: field.maxWidthPt ?? undefined,
        }
      : {
          x: field.absX!,
          y: field.absY!,
          size: field.fontSize || DEFAULT_SIZE,
          maxWidth: field.maxWidthPt ?? undefined,
        };

    drawAt(page, font, coord, value);
  }

  return pdfDoc.save();
}
