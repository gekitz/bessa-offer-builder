import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getDeliveryNoteMock = vi.fn();
const updateDeliveryItemMock = vi.fn();
const hydrateCatalogMock = vi.fn();

vi.mock('../../api/deliveryNoteApi', () => ({
  getDeliveryNote: (id: string) => getDeliveryNoteMock(id),
  updateDeliveryItem: (id: string, patch: unknown) => updateDeliveryItemMock(id, patch),
  addDeliveryItem: vi.fn(),
  removeDeliveryItem: vi.fn(),
  updateDeliveryNote: vi.fn(),
  signDeliveryNote: vi.fn(),
}));
vi.mock('../../../offers/data/catalogLoader', () => ({
  hydrateCatalog: () => hydrateCatalogMock(),
}));
// ALL is the hydrated catalog lookup; provide a serialised + a plain product.
vi.mock('../../../offers/data/catalogs', () => ({
  ALL: {
    'ser-1': { id: 'ser-1', name: 'Sunmi L3', t: 'h', isSerialized: true },
    'plain-1': { id: 'plain-1', name: 'Kabel', t: 'h' },
  },
}));

import DeliveryNoteDetail from '../DeliveryNoteDetail';
import type { DeliveryNote, DeliveryNoteItem, Ticket } from '../../types';

const ticket = { id: 't-1', ticketNumber: '26-0000001', customerName: 'Müller' } as unknown as Ticket;

const note: DeliveryNote = {
  id: 'dn-1', ticketId: 't-1', seqNumber: 1, status: 'draft', note: null,
  signatureData: null, signedAt: null, signedByName: null, performedAt: '2026-09-05',
  mesonicBelegLaufnummer: null, mesonicBelegKey: null, mesonicBelegCreatedAt: null,
  createdBy: null, createdAt: '', updatedAt: '',
};

function item(over: Partial<DeliveryNoteItem>): DeliveryNoteItem {
  return {
    id: 'i', deliveryNoteId: 'dn-1', productId: null, mesonicArtikelNr: null,
    bezeichnung: 'X', quantity: 1, unitPrice: 0, isFreetext: false,
    serialNumbers: [], sort: 0, createdAt: '', ...over,
  };
}

beforeEach(() => {
  updateDeliveryItemMock.mockReset().mockImplementation(async (_id, patch) => ({ ...item({ id: 'i2' }), ...patch }));
  hydrateCatalogMock.mockReset().mockResolvedValue(true);
});

describe('DeliveryNoteDetail — serial capture', () => {
  it('auto-expands a serial input for a serialised product', async () => {
    getDeliveryNoteMock.mockResolvedValue({
      deliveryNote: note,
      items: [item({ id: 'a', productId: 'ser-1', bezeichnung: 'Sunmi L3', quantity: 1 })],
    });
    render(<DeliveryNoteDetail ticket={ticket} deliveryNoteId="dn-1" onBack={vi.fn()} />);
    await screen.findByText(/Lieferschein #1/);
    await waitFor(() => expect(screen.getByPlaceholderText('Seriennummer')).toBeInTheDocument());
    // No reveal button — it's already open.
    expect(screen.queryByRole('button', { name: /Seriennummer erfassen/ })).not.toBeInTheDocument();
  });

  it('offers a reveal button on a non-serialised line and shows the input after click', async () => {
    getDeliveryNoteMock.mockResolvedValue({
      deliveryNote: note,
      items: [item({ id: 'b', productId: 'plain-1', bezeichnung: 'Kabel', quantity: 1 })],
    });
    const u = userEvent.setup();
    render(<DeliveryNoteDetail ticket={ticket} deliveryNoteId="dn-1" onBack={vi.fn()} />);
    await screen.findByText(/Lieferschein #1/);

    const reveal = await screen.findByRole('button', { name: /Seriennummer erfassen/ });
    expect(screen.queryByPlaceholderText('Seriennummer')).not.toBeInTheDocument();
    await u.click(reveal);
    expect(screen.getByPlaceholderText('Seriennummer')).toBeInTheDocument();
  });
});
