import QRCode from 'qrcode';
import { PDFDocument } from '@cantoo/pdf-lib';

/**
 * Stamps a verification QR code into the lower-right of an ACORD 25 PDF.
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
  const QR_X = 612 - QR_SIZE - 22;
  const QR_Y = 22;
  page.drawImage(qrImage, { x: QR_X, y: QR_Y + 10, width: QR_SIZE, height: QR_SIZE });

  const { StandardFonts } = await import('@cantoo/pdf-lib');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const caption = 'Verify at policyplace.com/verify';
  const captionSize = 5;
  const captionWidth = font.widthOfTextAtSize(caption, captionSize);
  page.drawText(caption, {
    x: QR_X + (QR_SIZE - captionWidth) / 2,
    y: QR_Y + 3,
    size: captionSize,
    font,
  });

  return doc.save();
}
