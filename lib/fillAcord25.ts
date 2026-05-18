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
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from '@cantoo/pdf-lib';
import type { CoiInput, Coverage } from './types.js';
import { COORDS, DEFAULT_SIZE, PAGE_WIDTH, PAGE_HEIGHT, type Coord } from './coords.js';

/**
 * Format a dollar amount the way ACORD certs do: comma-grouped, no decimals.
 * Example: 1000000 → "1,000,000"
 */
function fmtMoney(n: number): string {
  return n.toLocaleString('en-US');
}

function drawAt(page: PDFPage, font: PDFFont, coord: Coord, text: string): void {
  if (!text) return;
  const size = coord.size ?? DEFAULT_SIZE;
  page.drawText(text, {
    x: coord.x,
    y: coord.y,
    size,
    font,
    color: rgb(0, 0, 0),
    maxWidth: coord.maxWidth,
  });
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

  // 7. Cert number
  drawAt(page, font, COORDS.CERT_NUMBER, input.certNumber);

  // 8. Coverage rows — render each that's present in input
  const gl = findCoverage(input.coverages, 'GL');
  if (gl) {
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
    drawAt(page, font, COORDS.UMB_INSR_LTR, umb.insurerLetter);
    drawAt(page, font, COORDS.UMB_POLICY_NUMBER, umb.policyNumber);
    drawAt(page, font, COORDS.UMB_EFF_DATE, umb.effDate);
    drawAt(page, font, COORDS.UMB_EXP_DATE, umb.expDate);
    drawAt(page, font, COORDS.UMB_LIMIT_EACH_OCC, fmtMoney(umb.limits.eachOccurrence));
    drawAt(page, font, COORDS.UMB_LIMIT_AGG, fmtMoney(umb.limits.aggregate));
  }

  const wc = findCoverage(input.coverages, 'WC');
  if (wc) {
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

  // 9. Cert Holder block
  drawAt(page, font, COORDS.HOLDER_NAME, input.holder.name);
  drawAt(page, font, COORDS.HOLDER_ADDRESS_1, input.holder.address1);
  drawAt(page, font, COORDS.HOLDER_ADDRESS_2, input.holder.address2);

  // 10. Signature stamp (optional — Phase 1.5)
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

  return pdfDoc.save();
}
