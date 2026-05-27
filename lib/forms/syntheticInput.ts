/**
 * Synthetic CoiInput for the mapper preview pane.
 *
 * Every field in the dictionary should resolve to a recognizable placeholder
 * so the admin can see where each one lands as they map fields. Real-looking
 * but obviously-fake data — no production-looking numbers, real names, or
 * real policy numbers.
 */

import type { CoiInput } from '../types';

export const SYNTHETIC_COI_INPUT: CoiInput = {
  agency: {
    name: 'Sample Insurance Agency',
    address1: '100 Main Street',
    address2: 'Anytown, ST 12345',
    contactName: 'Sample Producer',
    phone: '(555) 123-4567',
    fax: '(555) 123-4568',
    email: 'sample@agency.example',
  },
  insured: {
    name: 'Sample Insured Business LLC',
    address1: '500 Business Drive',
    address2: 'Anytown, ST 12345',
  },
  insurers: [
    { letter: 'A', name: 'Sample Insurance Co A', naic: '11111' },
    { letter: 'B', name: 'Sample Insurance Co B', naic: '22222' },
    { letter: 'C', name: 'Sample Insurance Co C', naic: '33333' },
  ],
  coverages: [
    {
      type: 'GL',
      insurerLetter: 'A',
      policyNumber: 'SAMPLE-GL-001',
      effDate: '01/01/2026',
      expDate: '01/01/2027',
      generalAggregateAppliesPer: 'POLICY',
      limits: {
        eachOccurrence: 1_000_000,
        damageToRented: 100_000,
        medExp: 5_000,
        personalAdvInjury: 1_000_000,
        generalAggregate: 2_000_000,
        productsCompOp: 2_000_000,
      },
    },
    {
      type: 'AUTO',
      insurerLetter: 'A',
      policyNumber: 'SAMPLE-AUTO-001',
      effDate: '01/01/2026',
      expDate: '01/01/2027',
      anyAuto: true,
      limits: { combinedSingleLimit: 1_000_000 },
    },
    {
      type: 'UMBRELLA',
      insurerLetter: 'B',
      policyNumber: 'SAMPLE-UMB-001',
      effDate: '01/01/2026',
      expDate: '01/01/2027',
      deductibleVsRetention: 'RETENTION',
      limits: { eachOccurrence: 5_000_000, aggregate: 5_000_000, retention: 10_000 },
    },
    {
      type: 'WC',
      insurerLetter: 'C',
      policyNumber: 'SAMPLE-WC-001',
      effDate: '01/01/2026',
      expDate: '01/01/2027',
      perStatuteVsOther: 'PER_STATUTE',
      limits: {
        eachAccident: 1_000_000,
        diseaseEaEmployee: 1_000_000,
        diseasePolicyLimit: 1_000_000,
      },
    },
    {
      type: 'EQUIPMENT',
      insurerLetter: 'A',
      policyNumber: 'SAMPLE-EQUIP-001',
      effDate: '01/01/2026',
      expDate: '01/01/2027',
      description: 'Contractors Equipment',
      limits: { equipmentLimit: 250_000 },
    },
  ],
  holder: {
    name: 'Sample Certificate Holder',
    address1: '200 Holder Street',
    address2: 'Anytown, ST 12345',
  },
  certNumber: 'PP-PREVIEW-0001-XXX',
  certDate: new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }),
  description: 'PREVIEW — synthetic data for field-mapper testing.',
  signaturePngPath: '', // preview skips signature
  templatePngPath: '',  // assigned by renderer
};
