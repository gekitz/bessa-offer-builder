import { describe, expect, it } from 'vitest';
import { mmToPt, LABEL_SIZE, LABEL_WIDTH_MM, LABEL_HEIGHT_MM } from './labelFormat';

describe('labelFormat', () => {
  it('converts mm to points (1 in = 25.4 mm = 72 pt)', () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 6);
    expect(mmToPt(0)).toBe(0);
    expect(mmToPt(50)).toBeCloseTo(141.7323, 3);
  });

  it('exposes the 50×27 mm label as a points page size', () => {
    expect(LABEL_WIDTH_MM).toBe(50);
    expect(LABEL_HEIGHT_MM).toBe(27);
    expect(LABEL_SIZE[0]).toBeCloseTo(141.7323, 3);
    expect(LABEL_SIZE[1]).toBeCloseTo(76.5354, 3);
  });
});
