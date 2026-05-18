/**
 * Type contract for a Certificate of Insurance render request.
 *
 * Mirrors the data on an ACORD 25 (2016/03). Only what's needed to fill the form is here.
 * E&O-critical fields (addl_insured, subrogation_waived) live on each coverage and are
 * driven by Brook's on-file policy data, NEVER by client self-selection.
 */

export type Agency = {
  name: string;
  address1: string;
  address2: string;
  contactName: string;
  phone: string;
  fax: string;
  email: string;
};

export type Insured = {
  name: string;
  address1: string;
  address2: string;
};

export type InsurerLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type Insurer = {
  letter: InsurerLetter;
  name: string;
  naic: string;
};

export type GeneralLiabilityLimits = {
  eachOccurrence: number;
  damageToRented: number;
  medExp: number;
  personalAdvInjury: number;
  generalAggregate: number;
  productsCompOp: number;
};

export type AutoLimits = {
  combinedSingleLimit?: number;
  bodilyInjuryPerPerson?: number;
  bodilyInjuryPerAccident?: number;
  propertyDamage?: number;
};

export type UmbrellaLimits = {
  eachOccurrence: number;
  aggregate: number;
  retention?: number;
};

export type WorkersCompLimits = {
  eachAccident: number;
  diseaseEaEmployee: number;
  diseasePolicyLimit: number;
};

export type EquipmentLimits = {
  equipmentLimit: number;
};

export type CoverageBase = {
  insurerLetter: InsurerLetter;
  policyNumber: string;
  effDate: string;          // MM/DD/YYYY
  expDate: string;          // MM/DD/YYYY
  addlInsuredBlanket?: boolean;
  subrogationWaived?: boolean;
};

export type GLCoverage = CoverageBase & {
  type: 'GL';
  claimsMade?: boolean;     // false → occurrence (default for ACORD 25)
  generalAggregateAppliesPer: 'POLICY' | 'PROJECT' | 'LOC' | 'OTHER';
  limits: GeneralLiabilityLimits;
};

export type AutoCoverage = CoverageBase & {
  type: 'AUTO';
  anyAuto?: boolean;
  ownedAutosOnly?: boolean;
  scheduledAutos?: boolean;
  hiredAutosOnly?: boolean;
  nonOwnedAutosOnly?: boolean;
  limits: AutoLimits;
};

export type UmbrellaCoverage = CoverageBase & {
  type: 'UMBRELLA';
  excess?: boolean;
  claimsMade?: boolean;
  limits: UmbrellaLimits;
};

export type WCCoverage = CoverageBase & {
  type: 'WC';
  officerExcluded?: boolean;
  limits: WorkersCompLimits;
};

export type EquipmentCoverage = CoverageBase & {
  type: 'EQUIPMENT';
  description: string;
  limits: EquipmentLimits;
};

export type Coverage = GLCoverage | AutoCoverage | UmbrellaCoverage | WCCoverage | EquipmentCoverage;

export type Holder = {
  name: string;
  address1: string;
  address2: string;
};

export type CoiInput = {
  agency: Agency;
  insured: Insured;
  insurers: Insurer[];
  coverages: Coverage[];
  holder: Holder;
  certNumber: string;          // PP-YYYYMMDD-XXXX
  certDate: string;            // MM/DD/YYYY (today)
  /** Free-form DESCRIPTION OF OPERATIONS / LOCATIONS / VEHICLES text. Optional. */
  description?: string;
  /** Revision number string, e.g. "1". Optional — omit for original issuance. */
  revisionNumber?: string;
  signaturePngPath: string;    // path to signature image
  templatePngPath: string;     // path to ACORD 25 rasterized template
};
