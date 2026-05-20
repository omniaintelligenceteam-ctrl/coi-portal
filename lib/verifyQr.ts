import QRCode from 'qrcode';
import { PDFDocument } from '@cantoo/pdf-lib';
import { findAnchor } from './anchors';

/**
 * Stamps a verification QR code into the top-right corner of the
 * DESCRIPTION OF OPERATIONS box on an ACORD 25 PDF.
 *
 * Anchored to DESC_BOX (assets/template-regions.json) so the badge moves
 * with the template if ACORD ever revises that region. Sits clear of the
 * AUTHORIZED REPRESENTATIVE signature, the ACORD copyright mark, and every
 * data field. The only theoretical collision is a 4+ line description
 * reaching the right edge of the box — short/empty descriptions (the
 * common case) are unaffected.
 *
 * Non-throwing callers should catch errors and continue sending the cert:
 * QR is a trust add-on, not a blocker for issuance.
 */
export async function stampVerifyQr(
  pdfBytes: Uint8Array,
  certNumber: string,
): Promise<Uint8Array> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const verifyUrl = `${siteUrl}/verify/${certNumber}`;

  const qrPngDataUrl = await QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 6,
    color: { dark: '#000000ff', light: '#ffffffff' },
  });
  const qrPngBytes = Buffer.from(qrPngDataUrl.split(',')[1]!, 'base64');

  const doc = await PDFDocument.load(pdfBytes);
  const page = doc.getPage(0);
  const qrImage = await doc.embedPng(qrPngBytes);

  const QR_SIZE = 56;
  // DESC_BOX origin (x, y) is the bottom-left of the rect. Inset 4pt from
  // the top + right edges so the badge tucks into an empty corner.
  const descBox = findAnchor('DESC_BOX');
  const QR_X = descBox.x + descBox.width - QR_SIZE - 4;
  const QR_Y = descBox.y + descBox.height - QR_SIZE - 4;
  page.drawImage(qrImage, { x: QR_X, y: QR_Y, width: QR_SIZE, height: QR_SIZE });

  const { StandardFonts } = await import('@cantoo/pdf-lib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const caption = 'Verify at policyplace.com/verify';
  const captionSize = 5;
  const captionWidth = font.widthOfTextAtSize(caption, captionSize);
  page.drawText(caption, {
    x: QR_X + (QR_SIZE - captionWidth) / 2,
    y: QR_Y - 7,
    size: captionSize,
    font,
  });

  return doc.save();
}
