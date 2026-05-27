/**
 * Compile-time conversion of the legacy ACORD 25 COORDS map into the
 * data-driven FormFieldDef shape.
 *
 * Used by:
 *   - scripts/migrateAcord25ToDataDriven.ts (seeds form_fields rows in prod)
 *   - tests/acord25Parity.test.ts (in-memory FormDef for pixelmatch test
 *     without needing a live Supabase)
 *
 * Mapping rule: COORDS key → dictionary key = lowercase. Every non-SIGNATURE
 * COORDS entry has a matching dictionary entry; SIGNATURE is an image rect,
 * not a text field, and is skipped.
 *
 * If this assertion ever breaks (someone adds a COORDS key without a
 * dictionary entry), the function throws at module load — caught by the
 * parity test BEFORE any prod migration runs.
 */

import { FIELD_ANCHORS, COORDS } from '../coords';
import type { AnchorRef } from '../anchors';
import { isDictionaryKey } from './fieldDictionary';
import type { FormFieldDef } from './types';

/** Builds the ACORD 25 field map as standalone FormFieldDef rows (no id/formId).
 *  Caller assigns formId=ACORD_25 + lets Postgres generate ids on insert. */
export function buildAcord25Fields(): Array<Omit<FormFieldDef, 'id' | 'formId'>> {
  const rows: Array<Omit<FormFieldDef, 'id' | 'formId'>> = [];
  const skipped: string[] = [];

  for (const [coordKey, anchorRef] of Object.entries(FIELD_ANCHORS) as [string, AnchorRef][]) {
    const fieldKey = coordKey.toLowerCase();
    if (!isDictionaryKey(fieldKey)) {
      // SIGNATURE has no FIELD_ANCHORS entry (it's a region rect drawn via
      // rectFromRegion, not declared via declare()). If we ever reach this
      // branch for a different key, it's a real bug.
      skipped.push(coordKey);
      continue;
    }

    // Pull size + maxWidth from the resolved Coord (preserves the legacy
    // shrink-to-fit constraints exactly).
    const coord = (COORDS as Record<string, { size?: number; maxWidth?: number }>)[coordKey];

    rows.push({
      fieldKey,
      dataSource: fieldKey, // dictionary fields use fieldKey as data_source
      page: 1,
      anchorLabel: anchorRef.anchor,
      anchorSide: anchorRef.side,
      dx: anchorRef.dx,
      dy: anchorRef.dy,
      absX: null,
      absY: null,
      fontSize: coord?.size ?? 7.5,
      maxWidthPt: coord?.maxWidth ?? null,
      nearY: anchorRef.nearY ?? null,
    });
  }

  if (skipped.length > 0) {
    throw new Error(
      `acord25FieldMap: COORDS keys missing from field dictionary: ${skipped.join(', ')}. ` +
        `Add them to lib/forms/fieldDictionary.ts before running the migration.`,
    );
  }

  return rows;
}
