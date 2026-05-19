import { describe, it, expect } from 'vitest';
import { normalizeHolderInput, validateHolderInput } from '../lib/holderInput.js';

describe('normalizeHolderInput', () => {
  it('trims surrounding whitespace from all fields', () => {
    const result = normalizeHolderInput({
      name: '  ACME LLC  ',
      address1: ' 123 Main St ',
      address2: ' Suite 200  ',
    });

    expect(result).toEqual({
      name: 'ACME LLC',
      address1: '123 Main St',
      address2: 'Suite 200',
    });
  });

  it('normalizes missing address2 to an empty string', () => {
    const result = normalizeHolderInput({
      name: 'ACME LLC',
      address1: '123 Main St',
      address2: undefined,
    });

    expect(result.address2).toBe('');
  });
});

describe('validateHolderInput', () => {
  it('rejects blank holder names after trimming', () => {
    const result = validateHolderInput({
      name: '   ',
      address1: '123 Main St',
      address2: '',
    });

    expect(result).toEqual({ ok: false, error: 'holder name is required' });
  });

  it('rejects blank holder addresses after trimming', () => {
    const result = validateHolderInput({
      name: 'ACME LLC',
      address1: '   ',
      address2: '',
    });

    expect(result).toEqual({ ok: false, error: 'holder address is required' });
  });

  it('returns normalized holder data on valid input', () => {
    const result = validateHolderInput({
      name: '  ACME LLC ',
      address1: ' 123 Main St ',
      address2: '  ',
    });

    expect(result).toEqual({
      ok: true,
      holder: {
        name: 'ACME LLC',
        address1: '123 Main St',
        address2: '',
      },
    });
  });
});
