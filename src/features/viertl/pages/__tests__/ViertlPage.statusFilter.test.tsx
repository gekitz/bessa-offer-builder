import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ViertlLicense } from '../../types';

// Minimal-Fixture: nur die Felder, die Liste/Filter brauchen.
function lic(over: Partial<ViertlLicense>): ViertlLicense {
  return {
    id: 'x', mesonicKdnr: '1', name: 'X', vendor: 'gastrotouch', deviceModel: null,
    source: null, contact: null, street: null, plz: '9020', ort: 'Klagenfurt', email: null,
    emailCheckedAt: null, gastrotouchVersion: null, lastUpdate: null, hardwareModel: null,
    hardwareNeeded: false, wartung: 'none', status: 'new', customerStatus: 'active',
    closedReason: null, closedAt: null, notes: null, linkedOfferId: null, linkedTicketId: null,
    updatedById: null, updatedByName: null, createdAt: '', updatedAt: '',
    ...over,
  };
}

const LICENSES: ViertlLicense[] = [
  lic({ id: 'a', name: 'Alpha Neu', status: 'new' }),
  lic({ id: 'b', name: 'Beta Wartet', status: 'waiting' }),
  lic({ id: 'c', name: 'Gamma Retour', status: 'replied' }),
  lic({ id: 'd', name: 'Delta Fertig', status: 'done' }),
];

vi.mock('../../api/viertlApi', () => ({
  listLicenses: vi.fn(() => Promise.resolve(LICENSES)),
  listEvents: vi.fn(() => Promise.resolve([])),
  updateLicense: vi.fn(),
  addNote: vi.fn(),
  linkOffer: vi.fn(),
  unlinkOffer: vi.fn(),
  linkTicket: vi.fn(),
  unlinkTicket: vi.fn(),
  notifyViertlClosure: vi.fn(),
  recordMesonicLookup: vi.fn(),
}));

vi.mock('../../lib/mesonicContact', () => ({ fetchMesonicContact: vi.fn() }));
vi.mock('../../lib/offerLink', () => ({
  getOfferSummary: vi.fn(() => Promise.resolve(null)),
  offerImpliesStatus: vi.fn(() => null),
  suggestOffersForLicense: vi.fn(() => Promise.resolve([])),
}));
vi.mock('../../lib/ticketLink', () => ({ getTicketSummary: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../components/BelegePanel', () => ({ default: () => null }));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', display_name: 'Tester' }, isAdmin: false }),
}));

import ViertlPage from '../ViertlPage';

// Alle Kundennamen in der Tabelle (ohne den Detail-Drawer).
function visibleNames(): string[] {
  const table = screen.getByRole('table');
  return within(table)
    .getAllByRole('row')
    .map((r) => within(r).queryAllByText(/^(Alpha|Beta|Gamma|Delta)/)[0]?.textContent ?? '')
    .filter(Boolean);
}

// Das Status-Dropdown öffnen (Trigger trägt aria-label "Status filtern").
async function openStatusMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Status filtern' }));
}

describe('ViertlPage — Status-Mehrfachfilter (Multiselect-Dropdown)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('zeigt anfangs alle Zeilen (Platzhalter "Alle Status")', async () => {
    render(<ViertlPage />);
    expect(await screen.findByText('Alpha Neu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Status filtern' })).toHaveTextContent('Alle Status');
    expect(visibleNames()).toHaveLength(4);
  });

  it('filtert auf einen einzelnen Status', async () => {
    const user = userEvent.setup();
    render(<ViertlPage />);
    await screen.findByText('Alpha Neu');

    await openStatusMenu(user);
    await user.click(screen.getByRole('option', { name: /^Neu \d/ }));

    expect(visibleNames()).toEqual(['Alpha Neu']);
  });

  it('kombiniert mehrere Status (OR) und das Popover bleibt offen', async () => {
    const user = userEvent.setup();
    render(<ViertlPage />);
    await screen.findByText('Alpha Neu');

    await openStatusMenu(user);
    await user.click(screen.getByRole('option', { name: /^Neu \d/ }));
    // Popover bleibt offen → zweite Option direkt klickbar.
    await user.click(screen.getByRole('option', { name: /^Retour/ }));

    expect(visibleNames().sort()).toEqual(['Alpha Neu', 'Gamma Retour']);
    // Trigger fasst die Auswahl zusammen.
    expect(screen.getByRole('button', { name: 'Status filtern' })).toHaveTextContent('2 Status');
  });

  it('erneuter Klick entfernt den Status wieder', async () => {
    const user = userEvent.setup();
    render(<ViertlPage />);
    await screen.findByText('Alpha Neu');

    await openStatusMenu(user);
    await user.click(screen.getByRole('option', { name: /^Neu \d/ }));
    expect(visibleNames()).toEqual(['Alpha Neu']);

    await user.click(screen.getByRole('option', { name: /^Neu \d/ }));
    expect(visibleNames()).toHaveLength(4);
  });
});
