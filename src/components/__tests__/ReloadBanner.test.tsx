import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Fresh module graph per test so the banner and the bus share one singleton
// that starts un-stale.
async function setup() {
  vi.resetModules();
  const bus = await import('../../lib/reloadPrompt');
  const { default: ReloadBanner } = await import('../ReloadBanner');
  const utils = render(<ReloadBanner />);
  return { bus, ...utils };
}

describe('ReloadBanner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing until a stale chunk is signalled', async () => {
    const { bus } = await setup();
    expect(screen.queryByRole('button', { name: /neu laden/i })).toBeNull();

    act(() => bus.notifyStaleChunk());
    expect(screen.getByRole('button', { name: /neu laden/i })).toBeTruthy();
    expect(screen.getByText(/neue Version ist verfügbar/i)).toBeTruthy();
  });

  it('reloads the page when the button is clicked', async () => {
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable; replace the accessor.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });

    const { bus } = await setup();
    act(() => bus.notifyStaleChunk());
    await userEvent.click(screen.getByRole('button', { name: /neu laden/i }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
