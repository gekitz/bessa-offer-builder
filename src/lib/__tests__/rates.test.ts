import { describe, it, expect } from 'vitest';
import { KM_RATE_EUR_PER_KM, formatKmRate } from '../rates';

describe('km rate', () => {
  it('is the agreed standard rate', () => {
    expect(KM_RATE_EUR_PER_KM).toBe(0.75);
  });

  it('formats with a German decimal comma and the €/km suffix', () => {
    expect(formatKmRate()).toBe('0,75 €/km');
  });
});
