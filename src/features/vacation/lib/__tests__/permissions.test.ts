import { describe, it, expect } from 'vitest';
import { isApprover } from '../permissions';

describe('isApprover', () => {
  it('returns true for Georg (gkitz)', () => {
    expect(isApprover({ code: 'gkitz' })).toBe(true);
  });

  it('returns true for Herbert (hkitz)', () => {
    expect(isApprover({ code: 'hkitz' })).toBe(true);
  });

  it('returns false for any other employee', () => {
    for (const code of ['hrussnig', 'sbauer', 'mgraf', 'coberlerchner', 'mmaier']) {
      expect(isApprover({ code })).toBe(false);
    }
  });

  it('returns false for null / undefined / missing code', () => {
    expect(isApprover(null)).toBe(false);
    expect(isApprover(undefined)).toBe(false);
    expect(isApprover({})).toBe(false);
    expect(isApprover({ code: null })).toBe(false);
    expect(isApprover({ code: '' })).toBe(false);
  });
});
