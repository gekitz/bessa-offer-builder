import { describe, it, expect } from 'vitest';

/**
 * Smoke test: verifies that vitest itself runs and assertions work.
 * If this test fails, the test toolchain is broken — fix that before
 * worrying about anything else.
 */
describe('toolchain smoke test', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2);
  });

  it('supports typed assertions', () => {
    const obj: { name: string } = { name: 'KITZ' };
    expect(obj.name).toBe('KITZ');
    expect(obj).toMatchObject({ name: 'KITZ' });
  });

  it('has access to jsdom (browser-like globals)', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';
    document.body.appendChild(div);
    expect(document.body.querySelector('div')?.textContent).toBe('hello');
  });
});
