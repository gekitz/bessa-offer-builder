import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ViertlLicense } from '../../types';
import type { TicketSummary } from '../../lib/ticketLink';

// Lizenz ohne verknüpftes Ticket → Detail zeigt die "Neues Ticket"-Aktion.
const LICENSE: ViertlLicense = {
  id: 'lic-1',
  mesonicKdnr: '272765',
  name: 'Gasthaus Alpenblick',
  contact: 'Maria Huber',
  street: 'Dorfstraße 5',
  plz: '5020',
  ort: 'Salzburg',
  email: 'office@alpenblick.at',
  emailCheckedAt: '2026-09-01T00:00:00Z',
  gastrotouchVersion: '3.2',
  lastUpdate: '2026-08-01',
  hardwareModel: null,
  hardwareNeeded: false,
  wartung: 'sww',
  status: 'new',
  customerStatus: 'active',
  closedReason: null,
  closedAt: null,
  notes: null,
  linkedOfferId: null,
  linkedTicketId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// Dieselbe Lizenz, aber mit bereits verknüpftem Ticket.
const LICENSE_WITH_TICKET: ViertlLicense = { ...LICENSE, linkedTicketId: 'tk-1' };

const TICKET_SUMMARY: TicketSummary = {
  id: 'tk-1',
  ticketNumber: '26-0000042',
  title: 'Drucker druckt nicht',
  status: 'open',
  createdAt: '2026-09-28T08:00:00Z',
  closedAt: null,
};

vi.mock('../../api/viertlApi', () => ({
  listLicenses: vi.fn(() => Promise.resolve([LICENSE])),
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

vi.mock('../../lib/ticketLink', () => ({
  getTicketSummary: vi.fn(() => Promise.resolve(null)),
}));

// BelegePanel würde Supabase/Netzwerk anziehen — hier nicht relevant.
vi.mock('../../components/BelegePanel', () => ({ default: () => null }));

vi.mock('../../../../lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', display_name: 'Tester' }, isAdmin: false }),
}));

import ViertlPage from '../ViertlPage';
import { listLicenses, unlinkTicket } from '../../api/viertlApi';
import { getTicketSummary } from '../../lib/ticketLink';

async function openDetail() {
  const user = userEvent.setup();
  // Zeile per Kundenname anklicken → Detail-Panel öffnet.
  await user.click(await screen.findByText('Gasthaus Alpenblick'));
  return user;
}

describe('ViertlPage — Ticket aus der Viertl-Liste anlegen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([LICENSE]);
    (getTicketSummary as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it('"Neues Ticket" ruft onCreateTicket mit der Lizenz', async () => {
    const onCreateTicket = vi.fn();
    render(<ViertlPage onCreateTicket={onCreateTicket} />);

    const user = await openDetail();
    await user.click(await screen.findByRole('button', { name: /Neues Ticket/ }));

    expect(onCreateTicket).toHaveBeenCalledTimes(1);
    expect(onCreateTicket).toHaveBeenCalledWith(LICENSE);
  });

  it('ohne onCreateTicket wird der Button nicht angezeigt', async () => {
    render(<ViertlPage />);
    await openDetail();

    // Detail ist offen (Angebot-Aktion vorhanden), aber kein Ticket-Button.
    expect(await screen.findByRole('button', { name: /Bestehendes verknüpfen/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Neues Ticket/ })).not.toBeInTheDocument();
  });
});

describe('ViertlPage — verknüpftes Ticket anzeigen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listLicenses as ReturnType<typeof vi.fn>).mockResolvedValue([LICENSE_WITH_TICKET]);
    (getTicketSummary as ReturnType<typeof vi.fn>).mockResolvedValue(TICKET_SUMMARY);
    (unlinkTicket as ReturnType<typeof vi.fn>).mockResolvedValue({ ...LICENSE_WITH_TICKET, linkedTicketId: null });
  });

  it('zeigt Nummer + Titel des verknüpften Tickets statt des Anlegen-Buttons', async () => {
    render(<ViertlPage onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />);
    await openDetail();

    expect(await screen.findByText(/26-0000042/)).toBeInTheDocument();
    expect(screen.getByText('Drucker druckt nicht')).toBeInTheDocument();
    // Kein Anlegen-Button, solange schon ein Ticket verknüpft ist.
    expect(screen.queryByRole('button', { name: /Neues Ticket/ })).not.toBeInTheDocument();
  });

  it('"Öffnen" ruft onOpenTicket mit der Ticket-ID', async () => {
    const onOpenTicket = vi.fn();
    render(<ViertlPage onCreateTicket={vi.fn()} onOpenTicket={onOpenTicket} />);
    const user = await openDetail();

    await user.click(await screen.findByRole('button', { name: /Öffnen/ }));
    expect(onOpenTicket).toHaveBeenCalledWith('tk-1');
  });

  it('"Entfernen" löst die Verknüpfung über unlinkTicket', async () => {
    render(<ViertlPage onCreateTicket={vi.fn()} onOpenTicket={vi.fn()} />);
    const user = await openDetail();

    await user.click(await screen.findByRole('button', { name: /Entfernen/ }));
    expect(unlinkTicket).toHaveBeenCalledWith('lic-1', { id: 'u1', name: 'Tester' });
  });
});
