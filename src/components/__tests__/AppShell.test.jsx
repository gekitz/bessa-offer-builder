import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ profile: { display_name: 'Georg', microsoft_email: 'g.kitz@kitz.co.at' }, logout: vi.fn() }),
}));

import AppShell from '../AppShell';

beforeEach(() => {
  // Force the desktop layout (md+ width) so the sidebar is in the DOM.
  // jsdom defaults to ~1024px which already triggers it; the assertions
  // below use desktop-only test ids.
});

describe('AppShell', () => {
  it('renders no badge when badges.kalender is 0 / undefined', () => {
    render(<AppShell activeSection="angebote" onNavigate={vi.fn()}>{null}</AppShell>);
    expect(screen.queryByTestId('nav-badge-kalender')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-badge-mobile-kalender')).not.toBeInTheDocument();
  });

  it('renders the badge with the count when badges.kalender > 0', () => {
    render(
      <AppShell activeSection="angebote" onNavigate={vi.fn()} badges={{ kalender: 3 }}>
        {null}
      </AppShell>,
    );
    // Both desktop sidebar + mobile bottom-nav copies render the badge;
    // the responsive utility classes hide one of them via CSS, but
    // jsdom doesn't apply media queries so both nodes exist.
    const badges = screen.getAllByTestId(/nav-badge-(mobile-)?kalender/);
    expect(badges.length).toBeGreaterThanOrEqual(2);
    for (const b of badges) {
      expect(b.textContent).toBe('3');
    }
  });

  it('caps at "9+" on mobile and "99+" on desktop', () => {
    render(
      <AppShell activeSection="angebote" onNavigate={vi.fn()} badges={{ kalender: 150 }}>
        {null}
      </AppShell>,
    );
    expect(screen.getByTestId('nav-badge-kalender').textContent).toBe('99+');
    expect(screen.getByTestId('nav-badge-mobile-kalender').textContent).toBe('9+');
  });

  it('does not render badges for sections with 0 / negative counts', () => {
    render(
      <AppShell activeSection="angebote" onNavigate={vi.fn()} badges={{ kalender: 0, crm: -1 }}>
        {null}
      </AppShell>,
    );
    expect(screen.queryByTestId('nav-badge-kalender')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-badge-crm')).not.toBeInTheDocument();
  });

  it('renders the tickets nav entry with badge', () => {
    render(
      <AppShell activeSection="angebote" onNavigate={vi.fn()} badges={{ tickets: 7 }}>
        {null}
      </AppShell>,
    );
    const ticketBadges = screen.getAllByTestId(/nav-badge-(mobile-)?tickets/);
    expect(ticketBadges.length).toBeGreaterThanOrEqual(2);
    for (const b of ticketBadges) {
      expect(b.textContent).toBe('7');
    }
  });

  it('clicking a nav item with a badge still triggers onNavigate', async () => {
    const onNavigate = vi.fn();
    const u = userEvent.setup();
    render(
      <AppShell activeSection="angebote" onNavigate={onNavigate} badges={{ kalender: 5 }}>
        {null}
      </AppShell>,
    );
    // Sidebar Kalender button.
    const kalenderBtn = screen.getAllByRole('button', { name: /Kalender/ })[0];
    await u.click(kalenderBtn);
    expect(onNavigate).toHaveBeenCalledWith('kalender');
  });
});
