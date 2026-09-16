import { describe, expect, it } from 'vitest';
import { paginateStickers, STICKERS_PER_PAGE } from './stickerLayout';

describe('paginateStickers', () => {
  it('keeps a short list on a single page', () => {
    const pages = paginateStickers([1, 2, 3]);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(3);
  });

  it('splits into full pages of STICKERS_PER_PAGE with a partial last page', () => {
    const items = Array.from({ length: STICKERS_PER_PAGE * 2 + 5 }, (_, i) => i);
    const pages = paginateStickers(items);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toHaveLength(STICKERS_PER_PAGE);
    expect(pages[1]).toHaveLength(STICKERS_PER_PAGE);
    expect(pages[2]).toHaveLength(5);
  });

  it('returns no pages for an empty list', () => {
    expect(paginateStickers([])).toEqual([]);
  });

  it('honours a custom perPage', () => {
    expect(paginateStickers([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('rejects a perPage below 1', () => {
    expect(() => paginateStickers([1], 0)).toThrow();
  });
});
