import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listDeliveryNotesMock = vi.fn();
const createDeliveryNoteMock = vi.fn();
const addDeliveryItemsMock = vi.fn();
const getDeliveryNoteMock = vi.fn();
const getOfferMock = vi.fn();
const hydrateCatalogMock = vi.fn();
const buildItemsMock = vi.fn();

vi.mock('../../api/deliveryNoteApi', () => ({
  listDeliveryNotes: (ticketId: string) => listDeliveryNotesMock(ticketId),
  createDeliveryNote: (input: unknown) => createDeliveryNoteMock(input),
  addDeliveryItems: (id: string, items: unknown) => addDeliveryItemsMock(id, items),
  getDeliveryNote: (id: string) => getDeliveryNoteMock(id),
  // Used by the detail view once opened.
  addDeliveryItem: vi.fn(),
  updateDeliveryItem: vi.fn(),
  removeDeliveryItem: vi.fn(),
  updateDeliveryNote: vi.fn(),
  signDeliveryNote: vi.fn(),
}));
vi.mock('../../../../lib/offerApi', () => ({
  getOffer: (id: string) => getOfferMock(id),
}));
vi.mock('../../../offers/data/catalogLoader', () => ({
  hydrateCatalog: () => hydrateCatalogMock(),
}));
vi.mock('../../lib/deliveryNoteSeed', () => ({
  buildDeliveryItemsFromOffer: (offerData: unknown, catalog: unknown) => buildItemsMock(offerData, catalog),
}));

import DeliveryNotesTab from '../DeliveryNotesTab';
import type { DeliveryNote, Ticket } from '../../types';

const baseTicket: Ticket = {
  id: 't-1', ticketNumber: '26-0000001', shareCode: 'sc', title: 'T', description: null,
  kind: 'installation', priority: 'normal', status: 'open',
  poolAbteilungId: null, assignedTo: null, mesonicCustomerId: null,
  customerName: 'Müller', customerPhone: null, customerEmail: null,
  customerAddress: null, customerHasWartungsvertrag: false, standortId: null,
  billable: true, closedAt: null, closedBy: null, resolutionNote: null,
  offerId: null, mesonicBelegId: null, mesonicCrmKey: null,
  offerLaborMinutes: 0, offerLaborRate: null, offerLaborFloorBilledMinutes: 0,
  createdBy: null, createdAt: '2026-09-01T08:00:00Z', updatedAt: '2026-09-01T08:00:00Z',
};

const dn1: DeliveryNote = {
  id: 'dn-1', ticketId: 't-1', seqNumber: 1, status: 'draft', note: null,
  signatureData: null, signedAt: null, signedByName: null, performedAt: '2026-09-05',
  mesonicBelegLaufnummer: null, mesonicBelegKey: null, mesonicBelegCreatedAt: null,
  createdBy: null, createdAt: '', updatedAt: '',
};

beforeEach(() => {
  listDeliveryNotesMock.mockReset().mockResolvedValue([]);
  createDeliveryNoteMock.mockReset().mockResolvedValue({ ...dn1, id: 'dn-new', seqNumber: 2 });
  addDeliveryItemsMock.mockReset().mockResolvedValue([]);
  getDeliveryNoteMock.mockReset().mockResolvedValue({
    deliveryNote: { ...dn1, id: 'dn-new', seqNumber: 2 },
    items: [],
  });
  getOfferMock.mockReset().mockResolvedValue({ offer_data: { cart: { hw1: { qty: 1 } } } });
  hydrateCatalogMock.mockReset().mockResolvedValue(true);
  buildItemsMock.mockReset().mockReturnValue([
    { bezeichnung: 'Sunmi L3', quantity: 1, unitPrice: 599, isFreetext: false, serialNumbers: [] },
  ]);
});

describe('DeliveryNotesTab', () => {
  it('shows an empty state with a create button', async () => {
    render(<DeliveryNotesTab ticket={baseTicket} />);
    await screen.findByText(/Noch keine Lieferscheine/);
    expect(screen.getByRole('button', { name: /Neuer Lieferschein/ })).toBeInTheDocument();
  });

  it('hides "Aus Angebot übernehmen" when the ticket has no offer', async () => {
    render(<DeliveryNotesTab ticket={baseTicket} />);
    await screen.findByText(/Noch keine Lieferscheine/);
    expect(screen.queryByTestId('seed-delivery-note')).not.toBeInTheDocument();
  });

  it('lists existing delivery notes', async () => {
    listDeliveryNotesMock.mockResolvedValueOnce([dn1]);
    render(<DeliveryNotesTab ticket={baseTicket} />);
    await screen.findByText(/Lieferschein #1/);
    expect(screen.getAllByTestId('delivery-note-card')).toHaveLength(1);
  });

  it('creates a blank delivery note and opens its detail', async () => {
    const u = userEvent.setup();
    render(<DeliveryNotesTab ticket={baseTicket} currentEmployeeId="emp-a" />);
    await screen.findByText(/Noch keine Lieferscheine/);

    await u.click(screen.getByRole('button', { name: /Neuer Lieferschein/ }));

    await waitFor(() => expect(createDeliveryNoteMock).toHaveBeenCalled());
    expect(createDeliveryNoteMock.mock.calls[0][0]).toMatchObject({ ticketId: 't-1', createdBy: 'emp-a' });
    await screen.findByText(/Zurück zur Liste/);
    expect(getDeliveryNoteMock).toHaveBeenCalledWith('dn-new');
  });

  it('seeds a delivery note from the linked offer', async () => {
    const u = userEvent.setup();
    render(<DeliveryNotesTab ticket={{ ...baseTicket, offerId: 'off-1' }} currentEmployeeId="emp-a" />);
    await screen.findByText(/Noch keine Lieferscheine/);

    await u.click(screen.getByTestId('seed-delivery-note'));

    await waitFor(() => expect(createDeliveryNoteMock).toHaveBeenCalled());
    expect(getOfferMock).toHaveBeenCalledWith('off-1');
    expect(buildItemsMock).toHaveBeenCalled();
    await waitFor(() => expect(addDeliveryItemsMock).toHaveBeenCalled());
    const [, seededItems] = addDeliveryItemsMock.mock.calls[0];
    expect(seededItems).toHaveLength(1);
    expect(seededItems[0]).toMatchObject({ bezeichnung: 'Sunmi L3', unitPrice: 599 });
    await screen.findByText(/Zurück zur Liste/);
  });
});
