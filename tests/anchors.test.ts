/**
 * Unit tests for the anchor resolver.
 *
 * Verifies:
 *   - Known anchor resolves to expected (x, y) per `side` semantics.
 *   - Missing anchor throws MissingAnchorError with a non-empty suggestions list.
 *   - side="right" uses label.x + label.width + dx (the PP-0009 fix).
 */

import { describe, it, expect } from 'vitest';
import {
  findAnchor,
  resolveCoord,
  MissingAnchorError,
  LINE_HEIGHT,
  listAnchors,
} from '../lib/anchors.js';

describe('anchor resolver', () => {
  it('extracts a non-empty label set from template-anchors.json', () => {
    const all = listAnchors();
    expect(all.length).toBeGreaterThan(80);
    expect(all.length).toBeLessThan(200);
  });

  it('finds an exact match (case + whitespace insensitive)', () => {
    // "INSURER A :" is one of the load-bearing anchors for the PP-0009 fix
    const found = findAnchor('INSURER A :');
    expect(found.text).toBe('INSURER A :');
    expect(found.x).toBeGreaterThan(0);
    expect(found.y).toBeGreaterThan(0);
    expect(found.width).toBeGreaterThan(0);
  });

  it('finds with extra whitespace and different case', () => {
    const a = findAnchor('insurer a :');
    const b = findAnchor('  INSURER   A   :  ');
    expect(a.text).toBe('INSURER A :');
    expect(b.text).toBe('INSURER A :');
  });

  it('side="right" uses label end + dx (the PP-0009 fix mechanic)', () => {
    const label = findAnchor('INSURER A :');
    const resolved = resolveCoord({ anchor: 'INSURER A :', side: 'right', dx: 8, dy: 0 });
    expect(resolved.x).toBeCloseTo(label.x + label.width + 8, 2);
    expect(resolved.y).toBeCloseTo(label.y, 2);
  });

  it('side="left" uses label start + dx', () => {
    const label = findAnchor('PRODUCER');
    const resolved = resolveCoord({ anchor: 'PRODUCER', side: 'left', dx: 0, dy: 0 });
    expect(resolved.x).toBeCloseTo(label.x, 2);
    expect(resolved.y).toBeCloseTo(label.y, 2);
  });

  it('side="below" steps y down by one line height + dy', () => {
    const label = findAnchor('INSURED');
    const resolved = resolveCoord({ anchor: 'INSURED', side: 'below', dx: 0, dy: 0 });
    expect(resolved.x).toBeCloseTo(label.x, 2);
    expect(resolved.y).toBeCloseTo(label.y - LINE_HEIGHT, 2);
  });

  it('side="above" steps y up by one line height + dy', () => {
    const label = findAnchor('CERTIFICATE HOLDER');
    const resolved = resolveCoord({ anchor: 'CERTIFICATE HOLDER', side: 'above', dx: 0, dy: 0 });
    expect(resolved.y).toBeCloseTo(label.y + LINE_HEIGHT, 2);
  });

  it('side="row" uses absolute x but anchor y', () => {
    const label = findAnchor('COMMERCIAL GENERAL LIABILITY');
    const resolved = resolveCoord({
      anchor: 'COMMERCIAL GENERAL LIABILITY',
      side: 'row',
      dx: 223,
      dy: -6,
    });
    expect(resolved.x).toBe(223);
    expect(resolved.y).toBeCloseTo(label.y - 6, 2);
  });

  it('throws MissingAnchorError with suggestions on typo', () => {
    let caught: unknown;
    try {
      findAnchor('INSURRR A :');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(MissingAnchorError);
    const err = caught as MissingAnchorError;
    expect(err.suggestions.length).toBeGreaterThan(0);
    expect(err.suggestions.length).toBeLessThanOrEqual(3);
    // Top suggestion should be one of the INSURER labels (closest by Levenshtein)
    expect(err.suggestions[0]).toMatch(/INSURER/);
    expect(err.message).toContain('Did you mean');
    expect(err.message).toContain('extract-anchors');
  });

  it('resolveCoord propagates MissingAnchorError', () => {
    expect(() =>
      resolveCoord({ anchor: 'NOT A REAL LABEL', side: 'right', dx: 0, dy: 0 }),
    ).toThrow(MissingAnchorError);
  });

  it('disambiguates duplicate anchors by nearY', () => {
    // "EACH OCCURRENCE" appears in both GL (y≈482) and UMBRELLA (y≈338) rows
    const gl = findAnchor('EACH OCCURRENCE', 482);
    const umb = findAnchor('EACH OCCURRENCE', 338);
    expect(gl.y).toBeGreaterThan(400);
    expect(umb.y).toBeLessThan(400);
    expect(gl.y).not.toBeCloseTo(umb.y);
  });

  it('resolveCoord uses nearY for duplicate-anchor disambiguation', () => {
    const glResolved = resolveCoord({
      anchor: 'EACH OCCURRENCE',
      side: 'right',
      dx: 72,
      dy: 0,
      nearY: 482,
    });
    const umbResolved = resolveCoord({
      anchor: 'EACH OCCURRENCE',
      side: 'right',
      dx: 72,
      dy: 0,
      nearY: 338,
    });
    expect(glResolved.y).toBeGreaterThan(400);
    expect(umbResolved.y).toBeLessThan(400);
  });
});
