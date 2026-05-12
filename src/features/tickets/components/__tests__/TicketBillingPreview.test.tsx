import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const calculateTicketBillingMock = vi.fn();
const setTicketStatusMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  calculateTicketBilling: (id: string) => calculateTicketBillingMock(id),
  setTicketStatus: (id: string, status: string, opts?: unknown) => setTicketStatusMock(id, status, opts),
}));

import TicketBillingPreview from '../TicketBillingPreview';
import type { BillingSummary, Ticket } from '../../types';

const ticket: Ticket = {
  id: 't-1',
  ticketNumber: '26-0000001', shareCode: 'sc-test-0000001',
  title: 'T',
  description: null,
  kind: 'reparatur',
  priority: 'normal',
  status: 'open',
  poolAbteilungId: null,
  assignedTo: null,
  mesonicCustomerId: null,
  customerName: null,
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  customerHasWartungsvertrag: false,
  standortId: null,
  billable: true,
  closedAt: null,
  closedBy: null,
  resolutionNote: null,
  offerId: null,
  mesonicBelegId: null,
  createdBy: null,
  createdAt: '2026-05-11T08:00:00Z',
  updatedAt: '2026-05-11T08:00:00Z',
};

const summary: BillingSummary = {
  ticketId: 't-1',
  ticketNumber: '26-0000001',
  repairOrders: [
    {
      repairOrderId: 'ro-1',
      seqNumber: 1,
      performedAt: '2026-05-12',
      signed: true,
      positions: [
        {
          kind: 'labor',
          label: 'PC/NB',
          quantity: 2,
          unit: 'h',
          unitPrice: 130,
          total: 260,
          repairOrderId: 'ro-1',
          repairOrderSeq: 1,
          employeeName: 'Hannes Huber',
        },
        {
          kind: 'material',
          label: 'Sunmi V2',
          quantity: 1,
          unit: 'Stk',
          unitPrice: 450,
          total: 450,
          repairOrderId: 'ro-1',
          repairOrderSeq: 1,
          mesonicArtikelNr: 'SUNMI-V2',
        },
      ],
      laborTotal: 260,
      travelTotal: 0,
      materialTotal: 450,
      serviceTotal: 0,
      subtotal: 710,
    },
  ],
  laborTotal: 260,
  travelTotal: 0,
  materialTotal: 450,
  serviceTotal: 0,
  subtotalNet: 710,
  vatPercent: 20,
  vatAmount: 142,
  grandTotalGross: 852,
};

beforeEach(() => {
  calculateTicketBillingMock.mockReset().mockResolvedValue(summary);
  setTicketStatusMock.mockReset().mockResolvedValue({ ...ticket, status: 'closed' });
});

describe('TicketBillingPreview', () => {
  it('renders all totals from calculateTicketBilling', async () => {
    render(<TicketBillingPreview ticket={ticket} onClosed={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByTestId('billing-summary');
    expect(screen.getByText('Rep.schein #1')).toBeInTheDocument();
    expect(screen.getByText('PC/NB')).toBeInTheDocument();
    expect(screen.getByText('Sunmi V2')).toBeInTheDocument();
    // Grand total brutto
    expect(screen.getByTestId('billing-grand-total').textContent).toContain('€852.00');
  });

  it('confirms close calls setTicketStatus with closed + resolution note', async () => {
    const u = userEvent.setup();
    const onClosed = vi.fn();
    render(
      <TicketBillingPreview
        ticket={ticket}
        currentEmployeeId="emp-a"
        onClosed={onClosed}
        onCancel={vi.fn()}
      />,
    );
    await screen.findByTestId('billing-summary');

    await u.type(screen.getByPlaceholderText(/Was wurde gelöst/), 'Toner getauscht');
    await u.click(screen.getByTestId('billing-confirm-close'));

    await waitFor(() => expect(setTicketStatusMock).toHaveBeenCalled());
    const [id, status, opts] = setTicketStatusMock.mock.calls[0];
    expect(id).toBe('t-1');
    expect(status).toBe('closed');
    expect(opts.resolutionNote).toBe('Toner getauscht');
    expect(opts.closedBy).toBe('emp-a');
    expect(onClosed).toHaveBeenCalled();
  });

  it('falls back to a friendly message when there are no billable repair orders', async () => {
    calculateTicketBillingMock.mockResolvedValueOnce({
      ...summary,
      repairOrders: [],
      laborTotal: 0,
      travelTotal: 0,
      materialTotal: 0,
      serviceTotal: 0,
      subtotalNet: 0,
      vatAmount: 0,
      grandTotalGross: 0,
    });
    render(<TicketBillingPreview ticket={ticket} onClosed={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByText(/Keine verrechenbaren Reparaturscheine/);
  });

  it('disables the Mesonic-Beleg button while the import is blocked', async () => {
    render(<TicketBillingPreview ticket={ticket} onClosed={vi.fn()} onCancel={vi.fn()} />);
    await screen.findByTestId('billing-summary');
    const btn = screen.getByRole('button', { name: /Mesonic-Beleg/ });
    expect(btn).toBeDisabled();
  });
});
