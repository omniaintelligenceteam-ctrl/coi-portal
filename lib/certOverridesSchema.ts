/**
 * Zod schema for CertOverrides — the cert-level edit snapshot Brook submits
 * via the DecisionForm. Used by /api/decide-cert and /api/preview-cert.
 *
 * Mirrors lib/types.ts:CertOverrides. Keep the two in sync.
 */

import { z } from 'zod';

// MM/DD/YYYY — same format ACORD 25 expects on the rendered cert.
const dateString = z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/, {
  message: 'must be MM/DD/YYYY',
});

const text = (max: number) => z.string().max(max);

export const AgencyOverrideSchema = z
  .object({
    name: text(200).optional(),
    address1: text(200).optional(),
    address2: text(200).optional(),
    contactName: text(200).optional(),
    phone: text(40).optional(),
    fax: text(40).optional(),
    email: text(200).optional(),
  })
  .strict();

export const InsuredOverrideSchema = z
  .object({
    name: text(200).optional(),
    address1: text(200).optional(),
    address2: text(200).optional(),
  })
  .strict();

export const InsurerOverrideSchema = z
  .object({
    name: text(200).optional(),
    naic: text(20).optional(),
  })
  .strict();

export const CoverageOverrideSchema = z
  .object({
    policyNumber: text(60).optional(),
    effDate: dateString.optional(),
    expDate: dateString.optional(),
    limits: z.record(z.string(), z.number().nonnegative().optional()).optional(),
    addlInsuredBlanket: z.boolean().optional(),
    subrogationWaived: z.boolean().optional(),
    description: text(2000).optional(),
  })
  .strict();

export const CertOverridesSchema = z
  .object({
    agency: AgencyOverrideSchema.optional(),
    insured: InsuredOverrideSchema.optional(),
    description: text(2000).optional(),
    insurers: z.record(z.string(), InsurerOverrideSchema).optional(),
    coverages: z.record(z.string().uuid(), CoverageOverrideSchema).optional(),
  })
  .strict();

export type CertOverridesValidated = z.infer<typeof CertOverridesSchema>;

/**
 * True if the overrides object has at least one populated field. Empty objects
 * `{}` and `{coverages: {}}` both count as empty.
 */
export function hasOverrides(overrides: CertOverridesValidated | null | undefined): boolean {
  if (!overrides) return false;
  if (overrides.agency && Object.keys(overrides.agency).length > 0) return true;
  if (overrides.insured && Object.keys(overrides.insured).length > 0) return true;
  if (overrides.description && overrides.description.length > 0) return true;
  if (overrides.insurers && Object.keys(overrides.insurers).length > 0) return true;
  if (overrides.coverages && Object.keys(overrides.coverages).length > 0) {
    for (const cov of Object.values(overrides.coverages)) {
      if (Object.keys(cov).length > 0) return true;
    }
  }
  return false;
}
