/**
 * Canonical Sheffer COI fixture — used by both vitest and the regen script.
 * Matches the visual sample at ~/Downloads/Sheffer COI.pdf.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoiInput } from '../../lib/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

export const SHEFFER_FIXTURE: CoiInput = {
  agency: {
    name: 'The Policy Place',
    address1: '908 Poplar St',
    address2: 'Benton, KY 42025',
    contactName: 'Brook Gaudy',
    phone: '270-410-2015',
    fax: 'none',
    email: 'brook@yourpolicyplace.com',
  },
  insured: {
    name: 'Evans Electric Inc',
    address1: '36 Louise Lane',
    address2: 'Benton, KY 42025',
  },
  insurers: [
    { letter: 'A', name: 'Liberty Mutual', naic: '37206' },
    { letter: 'B', name: 'Great American Insurance Company', naic: '16691' },
  ],
  coverages: [
    {
      type: 'GL',
      insurerLetter: 'A',
      policyNumber: 'BKS68636367',
      effDate: '02/10/2026',
      expDate: '02/10/2027',
      generalAggregateAppliesPer: 'POLICY',
      limits: {
        eachOccurrence: 1_000_000,
        damageToRented: 300_000,
        medExp: 5_000,
        personalAdvInjury: 1_000_000,
        generalAggregate: 2_000_000,
        productsCompOp: 2_000_000,
      },
    },
    {
      type: 'WC',
      insurerLetter: 'B',
      policyNumber: 'WCF04252100',
      effDate: '06/08/2025',
      expDate: '06/08/2026',
      officerExcluded: true,
      limits: {
        eachAccident: 1_000_000,
        diseaseEaEmployee: 1_000_000,
        diseasePolicyLimit: 1_000_000,
      },
    },
    {
      type: 'EQUIPMENT',
      insurerLetter: 'A',
      policyNumber: 'BKS68636367',
      effDate: '02/10/2026',
      expDate: '02/10/2027',
      description: 'Contractors Equipment Rented/Leased',
      limits: { equipmentLimit: 100_000 },
    },
  ],
  holder: {
    name: 'Sheffer Construction & Development LLC',
    address1: '1425 N. Royal Ave.',
    address2: 'Evansville, IN 4771',
  },
  certNumber: 'PP-20260408-0001',
  certDate: '04/08/2026',
  signaturePngPath: '',
  templatePngPath: resolve(ROOT, 'assets/template/acord-25-page-1.png'),
};
