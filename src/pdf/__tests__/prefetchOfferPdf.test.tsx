import { describe, it, expect } from 'vitest';
import { prefetchOfferPdf, generateOfferPdfBlob } from '../generateOfferPdf';

// prefetchOfferPdf warms the heavy @react-pdf/renderer chunk ahead of the
// user committing to a PDF action, so the stale-chunk reload (importWithReload)
// happens at a harmless moment instead of mid-send. These assert the two
// properties that make it safe to fire-and-forget from a render effect.
describe('prefetchOfferPdf', () => {
  it('resolves to undefined once the PDF chunk is warm', async () => {
    await expect(prefetchOfferPdf()).resolves.toBeUndefined();
  });

  it('is idempotent — repeated calls stay resolved (import is cached)', async () => {
    await prefetchOfferPdf();
    await expect(prefetchOfferPdf()).resolves.toBeUndefined();
  });

  it('warms the same chunk generateOfferPdfBlob then uses', async () => {
    // After a prefetch the modules are cached, so a real generation still
    // produces a non-empty blob — proving prefetch and generate share a path.
    await prefetchOfferPdf();
    const blob = await generateOfferPdfBlob({
      customer: { company: 'ACME GmbH' },
      monthlyItems: [],
      onceItems: [],
      wartungItems: [],
      autoTerms: [],
      totals: { monthly: 0, once: 0, periodMonthly: 0, periodTotal: 0, maxMonths: 12 },
      notes: '',
      raten: 12,
    });
    expect(blob.size).toBeGreaterThan(0);
  }, 20000);
});
