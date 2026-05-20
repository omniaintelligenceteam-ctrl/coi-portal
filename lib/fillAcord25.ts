/**
 * Render an ACORD 25 Certificate of Liability Insurance PDF.
 *
 * Strategy: PNG-overlay (NOT AcroForm fill).
 *
 * Why: The official ACORD 25 fillable PDF is XFA-only — its /AcroForm dict
 * contains zero text-field / button widgets. All form data lives in the XFA
 * XML stream. pdf-lib (and @cantoo/pdf-lib) cannot read or write XFA, so the
 * canonical "fill named field" approach is impossible without external tools.
 *
 * Approach instead:
 *   1. Pre-rasterized PNG of the official template (assets/template/acord-25-page-1.png)
 *      acts as the page background.
 *   2. We create a fresh PDF, draw the template PNG full-page, then draw text
 *      at known coordinates (lib/coords.ts) for each field.
 *   3. Signature (optional) is drawn last as a PNG image.
 *   4. Output is naturally flat (no editable widgets exist).
 *
 * Coordinate origin is bottom-left in PDF points (72/inch). Page is US Letter (612x792).
 */

import { readFile } from 'node:fs/promises';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { CoiInput, Coverage } from './types';
import { COORDS, FIELD_VALIDATORS, DEFAULT_SIZE, PAGE_WIDTH, PAGE_HEIGHT, type Coord } from './coords';
import { LINE_HEIGHT } from './anchors';

/**
 * Format a dollar amount the way ACORD certs do: comma-grouped, no decimals.
 * Example: 1000000 → "1,000,000"
 */
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US');
}

// Reverse lookup: coord object → field key. Built once at module load so
// drawAt can validate without needing a key parameter at every call site.
const coordToKey = new Map<Coord, string>(
  (Object.entries(COORDS) as Array<[string, Coord | { x: number; y: number; width: number; height: number }]>)
    .filter(([, v]) => !('width' in v))
    .map(([k, v]) => [v as Coord, k]),
);

const MIN_FONT_SIZE = 6.5;

/**
 * Layout a text value into the declared cell, attempting to fit without
 * truncation:
 *   1. Try declared size — if it fits within maxWidth, draw as-is.
 *   2. Shrink in 0.5pt steps down to MIN_FONT_SIZE.
 *   3. If still too wide at MIN_FONT_SIZE, split at word boundaries and draw
 *      two lines (second line at y - LINE_HEIGHT).
 *
 * When no maxWidth is declared, draws at declared size (unchanged behaviour).
 */
function drawAt(page: PDFPage, font: PDFFont, coord: Coord, text: string): void {
  if (!text) return;
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'none' || trimmed === 'n/a' || trimmed === 'na') return;

  // Run Zod validator if one is registered for this field.
  const key = coordToKey.get(coord);
  if (key) {
    const schema = FIELD_VALIDATORS[key];
    if (schema) {
      const result = schema.safeParse(text);
      if (!result.success) {
        throw new Error(
          `fillAcord25: invalid value for field ${key}: "${text}". ${result.error.issues.map((i) => i.message).join(', ')}`,
        );
      }
    }
  }

  const maxWidth = coord.maxWidth;
  let size = coord.size ?? DEFAULT_SIZE;

  // No maxWidth constraint — draw at declared size.
  if (!maxWidth) {
    page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0) });
    return;
  }

  // Step 1: fits at declared size?
  if (font.widthOfTextAtSize(text, size) <= maxWidth) {
    page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0), maxWidth });
    return;
  }

  // Step 2: shrink to fit.
  while (size > MIN_FONT_SIZE) {
    size -= 0.5;
    if (font.widthOfTextAtSize(text, size) <= maxWidth) {
      page.drawText(text, { x: coord.x, y: coord.y, size, font, color: rgb(0, 0, 0), maxWidth });
      return;
    }
  }

  // Step 3: split into two lines at MIN_FONT_SIZE.
  const words = text.split(' ');
  let line1 = '';
  let splitIdx = 0;
  for (let i = 0; i < words.length; i++) {
    const candidate = i === 0 ? words[0]! : line1 + ' ' + words[i]!;
    if (font.widthOfTextAtSize(candidate, MIN_FONT_SIZE) > maxWidth) break;
    line1 = candidate;
    splitIdx = i + 1;
  }
  const line2 = words.slice(splitIdx).join(' ');
  page.drawText(line1 || text, { x: coord.x, y: coord.y, size: MIN_FONT_SIZE, font, color: rgb(0, 0, 0), maxWidth });
  if (line2) {
    page.drawText(line2, { x: coord.x, y: coord.y - LINE_HEIGHT, size: MIN_FONT_SIZE, font, color: rgb(0, 0, 0), maxWidth });
  }
}

function findCoverage<T extends Coverage['type']>(
  coverages: Coverage[],
  type: T,
): Extract<Coverage, { type: T }> | undefined {
  return coverages.find((c) => c.type === type) as Extract<Coverage, { type: T }> | undefined;
}

export async function fillAcord25(input: CoiInput): Promise<Uint8Array> {
  // 1. Create fresh PDF doc
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  // 2. Draw rasterized ACORD 25 template as background
  const templateBytes = await readFile(input.templatePngPath);
  const templateImage = await pdfDoc.embedPng(templateBytes);
  page.drawImage(templateImage, { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT });

  // 3. Header — today's date
  drawAt(page, font, COORDS.DATE, input.certDate);

  // 4. Producer block
  drawAt(page, font, COORDS.PRODUCER_NAME, input.agency.name);
  drawAt(page, font, COORDS.PRODUCER_ADDRESS_1, input.agency.address1);
  drawAt(page, font, COORDS.PRODUCER_ADDRESS_2, input.agency.address2);
  drawAt(page, font, COORDS.CONTACT_NAME, input.agency.contactName);
  drawAt(page, font, COORDS.CONTACT_PHONE, input.agency.phone);
  drawAt(page, font, COORDS.CONTACT_FAX, input.agency.fax);
  drawAt(page, font, COORDS.CONTACT_EMAIL, input.agency.email);

  // 5. Insurers
  const insurerCoords = {
    A: { name: COORDS.INSURER_A_NAME, naic: COORDS.INSURER_A_NAIC },
    B: { name: COORDS.INSURER_B_NAME, naic: COORDS.INSURER_B_NAIC },
    C: { name: COORDS.INSURER_C_NAME, naic: COORDS.INSURER_C_NAIC },
    D: { name: COORDS.INSURER_D_NAME, naic: COORDS.INSURER_D_NAIC },
    E: { name: COORDS.INSURER_E_NAME, naic: COORDS.INSURER_E_NAIC },
    F: { name: COORDS.INSURER_F_NAME, naic: COORDS.INSURER_F_NAIC },
  } as const;
  for (const ins of input.insurers) {
    const slot = insurerCoords[ins.letter];
    drawAt(page, font, slot.name, ins.name);
    drawAt(page, font, slot.naic, ins.naic);
  }

  // 6. Insured block
  drawAt(page, font, COORDS.INSURED_NAME, input.insured.name);
  drawAt(page, font, COORDS.INSURED_ADDRESS_1, input.insured.address1);
  drawAt(page, font, COORDS.INSURED_ADDRESS_2, input.insured.address2);

  // 7. Cert number + optional revision
  drawAt(page, font, COORDS.CERT_NUMBER, input.certNumber);
  if (input.revisionNumber) drawAt(page, font, COORDS.REVISION_NUMBER, input.revisionNumber);

  // 8. Coverage rows — render each that's present in input
  const gl = findCoverage(input.coverages, 'GL');
  if (gl) {
    drawAt(page, font, COORDS.GL_CHK_TYPE, 'X');
    if (gl.claimsMade) {
      drawAt(page, font, COORDS.GL_CHK_CLAIMS_MADE, 'X');
    } else {
      drawAt(page, font, COORDS.GL_CHK_OCCUR, 'X');
    }
    switch (gl.generalAggregateAppliesPer) {
      case 'POLICY':  drawAt(page, font, COORDS.GL_CHK_AGG_POLICY,  'X'); break;
      case 'PROJECT': drawAt(page, font, COORDS.GL_CHK_AGG_PROJECT, 'X'); break;
      case 'LOC':     drawAt(page, font, COORDS.GL_CHK_AGG_LOC,     'X'); break;
      case 'OTHER':
        drawAt(page, font, COORDS.GL_CHK_AGG_OTHER, 'X');
        if (gl.generalAggregateOtherText) {
          drawAt(page, font, COORDS.GL_AGG_OTHER_TEXT, gl.generalAggregateOtherText);
        }
        break;
    }
    drawAt(page, font, COORDS.GL_INSR_LTR, gl.insurerLetter);
    drawAt(page, font, COORDS.GL_POLICY_NUMBER, gl.policyNumber);
    drawAt(page, font, COORDS.GL_EFF_DATE, gl.effDate);
    drawAt(page, font, COORDS.GL_EXP_DATE, gl.expDate);
    drawAt(page, font, COORDS.GL_LIMIT_EACH_OCC, fmtMoney(gl.limits.eachOccurrence));
    drawAt(page, font, COORDS.GL_LIMIT_DAMAGE_RENT, fmtMoney(gl.limits.damageToRented));
    drawAt(page, font, COORDS.GL_LIMIT_MED_EXP, fmtMoney(gl.limits.medExp));
    drawAt(page, font, COORDS.GL_LIMIT_PERS_ADV_INJ, fmtMoney(gl.limits.personalAdvInjury));
    drawAt(page, font, COORDS.GL_LIMIT_GEN_AGG, fmtMoney(gl.limits.generalAggregate));
    drawAt(page, font, COORDS.GL_LIMIT_PROD_COMP_OP, fmtMoney(gl.limits.productsCompOp));
  }

  const auto = findCoverage(input.coverages, 'AUTO');
  if (auto) {
    if (auto.anyAuto)            drawAt(page, font, COORDS.AUTO_CHK_ANY_AUTO,  'X');
    if (auto.ownedAutosOnly)     drawAt(page, font, COORDS.AUTO_CHK_OWNED,     'X');
    if (auto.scheduledAutos)     drawAt(page, font, COORDS.AUTO_CHK_SCHEDULED, 'X');
    if (auto.hiredAutosOnly)     drawAt(page, font, COORDS.AUTO_CHK_HIRED,     'X');
    if (auto.nonOwnedAutosOnly)  drawAt(page, font, COORDS.AUTO_CHK_NON_OWNED, 'X');
    drawAt(page, font, COORDS.AUTO_INSR_LTR, auto.insurerLetter);
    drawAt(page, font, COORDS.AUTO_POLICY_NUMBER, auto.policyNumber);
    drawAt(page, font, COORDS.AUTO_EFF_DATE, auto.effDate);
    drawAt(page, font, COORDS.AUTO_EXP_DATE, auto.expDate);
    if (auto.limits.combinedSingleLimit !== undefined) {
      drawAt(page, font, COORDS.AUTO_LIMIT_CSL, fmtMoney(auto.limits.combinedSingleLimit));
    }
    if (auto.limits.bodilyInjuryPerPerson !== undefined) {
      drawAt(page, font, COORDS.AUTO_LIMIT_BI_PER_PERS, fmtMoney(auto.limits.bodilyInjuryPerPerson));
    }
    if (auto.limits.bodilyInjuryPerAccident !== undefined) {
      drawAt(page, font, COORDS.AUTO_LIMIT_BI_PER_ACC, fmtMoney(auto.limits.bodilyInjuryPerAccident));
    }
    if (auto.limits.propertyDamage !== undefined) {
      drawAt(page, font, COORDS.AUTO_LIMIT_PD, fmtMoney(auto.limits.propertyDamage));
    }
  }

  const umb = findCoverage(input.coverages, 'UMBRELLA');
  if (umb) {
    if (umb.excess) {
      drawAt(page, font, COORDS.UMB_CHK_EXCESS, 'X');
    } else {
      drawAt(page, font, COORDS.UMB_CHK_UMBRELLA, 'X');
    }
    if (umb.claimsMade) {
      drawAt(page, font, COORDS.UMB_CHK_CLAIMS_MADE, 'X');
    } else {
      drawAt(page, font, COORDS.UMB_CHK_OCCUR, 'X');
    }
    if (umb.deductibleVsRetention === 'DED') {
      drawAt(page, font, COORDS.UMB_CHK_DED, 'X');
    } else if (umb.deductibleVsRetention === 'RETENTION') {
      drawAt(page, font, COORDS.UMB_CHK_RETENTION, 'X');
    }
    drawAt(page, font, COORDS.UMB_INSR_LTR, umb.insurerLetter);
    drawAt(page, font, COORDS.UMB_POLICY_NUMBER, umb.policyNumber);
    drawAt(page, font, COORDS.UMB_EFF_DATE, umb.effDate);
    drawAt(page, font, COORDS.UMB_EXP_DATE, umb.expDate);
    drawAt(page, font, COORDS.UMB_LIMIT_EACH_OCC, fmtMoney(umb.limits.eachOccurrence));
    drawAt(page, font, COORDS.UMB_LIMIT_AGG, fmtMoney(umb.limits.aggregate));
    if (umb.limits.retention !== undefined && umb.limits.retention > 0) {
      drawAt(page, font, COORDS.UMB_LIMIT_RETENTION, fmtMoney(umb.limits.retention));
    }
  }

  const wc = findCoverage(input.coverages, 'WC');
  if (wc) {
    if (wc.perStatuteVsOther === 'OTHER') {
      drawAt(page, font, COORDS.WC_CHK_OTHER, 'X');
      if (wc.perStatuteOtherText) {
        drawAt(page, font, COORDS.WC_OTHER_TEXT, wc.perStatuteOtherText);
      }
    } else {
      drawAt(page, font, COORDS.WC_CHK_PER_STATUTE, 'X');
    }
    drawAt(page, font, COORDS.WC_OFFICER_YN, wc.officerExcluded ? 'Y' : 'N');
    drawAt(page, font, COORDS.WC_INSR_LTR, wc.insurerLetter);
    drawAt(page, font, COORDS.WC_POLICY_NUMBER, wc.policyNumber);
    drawAt(page, font, COORDS.WC_EFF_DATE, wc.effDate);
    drawAt(page, font, COORDS.WC_EXP_DATE, wc.expDate);
    drawAt(page, font, COORDS.WC_LIMIT_EACH_ACC, fmtMoney(wc.limits.eachAccident));
    drawAt(page, font, COORDS.WC_LIMIT_DIS_EA_EMPL, fmtMoney(wc.limits.diseaseEaEmployee));
    drawAt(page, font, COORDS.WC_LIMIT_DIS_POL_LIM, fmtMoney(wc.limits.diseasePolicyLimit));
  }

  // EQUIPMENT (and any other miscellaneous coverage) goes in the bottom OTHER row
  const equipment = findCoverage(input.coverages, 'EQUIPMENT');
  if (equipment) {
    drawAt(page, font, COORDS.OTHER_INSR_LTR, equipment.insurerLetter);
    drawAt(page, font, COORDS.OTHER_DESCRIPTION, equipment.description);
    drawAt(page, font, COORDS.OTHER_POLICY_NUMBER, equipment.policyNumber);
    drawAt(page, font, COORDS.OTHER_EFF_DATE, equipment.effDate);
    drawAt(page, font, COORDS.OTHER_EXP_DATE, equipment.expDate);
    drawAt(page, font, COORDS.OTHER_LIMIT, fmtMoney(equipment.limits.equipmentLimit));
  }

  // 9. Description of Operations (optional free-form text)
  if (input.description) drawAt(page, font, COORDS.DESCRIPTION, input.description);

  // 10. Cert Holder block
  drawAt(page, font, COORDS.HOLDER_NAME, input.holder.name);
  drawAt(page, font, COORDS.HOLDER_ADDRESS_1, input.holder.address1);
  drawAt(page, font, COORDS.HOLDER_ADDRESS_2, input.holder.address2);

  // 11. Signature stamp (optional — Phase 1.5)
  if (input.signaturePngPath) {
    try {
      const sigBytes = await readFile(input.signaturePngPath);
      const sigImage = await pdfDoc.embedPng(sigBytes);
      const { x, y, width, height } = COORDS.SIGNATURE;
      page.drawImage(sigImage, { x, y, width, height });
    } catch (err) {
      // Signature PNG missing — render proceeds without it.
      // In Phase 2 this becomes a hard requirement enforced upstream.
      console.warn(`fillAcord25: signature PNG not loaded (${(err as Error).message}). Continuing without stamp.`);
    }
  }

  // 12. VOIDED watermark — stamped LAST so it sits on top of every field.
  // The cert remains legible underneath (opacity 0.35), but no holder could
  // mistake it for a valid in-force certificate.
  if (input.voided) {
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    await drawVoidedWatermark(page, bold);
  }

  return pdfDoc.save();
}

/**
 * Draw a diagonal "VOIDED" watermark across the rendered cert.
 *
 * Positioned to span the page centerline. Rotated 30° counter-clockwise from
 * horizontal — the standard "void" stamp angle on insurance / legal docs.
 * Size and tracking are tuned so the word reaches from the lower-left card
 * area up through the upper-right insurer block at US-Letter dimensions.
 */
async function drawVoidedWatermark(page: PDFPage, font: PDFFont): Promise<void> {
  const text = 'VOIDED';
  const size = 130;
  const angleDeg = 30;
  const angleRad = (angleDeg * Math.PI) / 180;
  const textWidth = font.widthOfTextAtSize(text, size);
  // Position so the rotated text is roughly centered on the page.
  const centerX = PAGE_WIDTH / 2;
  const centerY = PAGE_HEIGHT / 2;
  // Rotation in pdf-lib pivots around (x, y). We offset so the text's center
  // lands on (centerX, centerY) after rotation.
  const dx = (textWidth / 2) * Math.cos(angleRad) - (size / 2) * Math.sin(angleRad);
  const dy = (textWidth / 2) * Math.sin(angleRad) + (size / 2) * Math.cos(angleRad);
  page.drawText(text, {
    x: centerX - dx,
    y: centerY - dy,
    size,
    font,
    color: rgb(0.78, 0.12, 0.12), // muted red — readable but obviously a stamp
    opacity: 0.35,
    rotate: degrees(angleDeg),
  });
}
