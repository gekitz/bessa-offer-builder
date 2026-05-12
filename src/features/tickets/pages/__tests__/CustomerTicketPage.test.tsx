import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getPublicTicketViewMock = vi.fn();
const addPublicCommentMock = vi.fn();

vi.mock('../../api/publicTicketApi', () => ({
  getPublicTicketView: (code: string) => getPublicTicketViewMock(code),
  addPublicComment: (code: string, body: string) => addPublicCommentMock(code, body),
}));

import CustomerTicketPage from '../CustomerTicketPage';
import type { PublicTicketView } from '../../api/publicTicketApi';

function makeView(over: Partial<PublicTicketView> = {}): PublicTicketView {
  return {
    ticket: {
      id: 't-1',
      shareCode: 'sc-abc',
      ticketNumber: '26-0000001',
      title: 'Drucker druckt nicht',
      description: 'Toner-Fehler — wird offline angezeigt.',
      kind: 'reparatur',
      status: 'in_progress',
      customerName: 'Müller GmbH',
      closedAt: null,
      resolutionNote: null,
      createdAt: '2026-05-10T08:00:00Z',
    },
    appointments: [],
    timeline: [],
    ...over,
  };
}

beforeEach(() => {
  getPublicTicketViewMock.mockReset();
  addPublicCommentMock.mockReset();
});

describe('CustomerTicketPage', () => {
  it('shows a friendly not-found message when the share code resolves to nothing', async () => {
    getPublicTicketViewMock.mockResolvedValueOnce(null);
    render(<CustomerTicketPage shareCode="bad-code" />);
    await screen.findByText(/Auftrag nicht verfügbar/);
  });

  it('renders the ticket-number, status badge and title', async () => {
    getPublicTicketViewMock.mockResolvedValueOnce(makeView());
    render(<CustomerTicketPage shareCode="sc-abc" />);
    await screen.findByText('26-0000001');
    expect(screen.getByText('In Bearbeitung')).toBeInTheDocument();
    expect(screen.getByText('Drucker druckt nicht')).toBeInTheDocument();
  });

  it('renders appointments in the timeline', async () => {
    getPublicTicketViewMock.mockResolvedValueOnce(
      makeView({
        appointments: [
          {
            id: 'a-1',
            title: 'Vor-Ort-Reparatur',
            description: null,
            kind: 'reparatur',
            startsAt: '2026-05-15T09:00:00.000Z',
            endsAt: '2026-05-15T11:00:00.000Z',
            allDay: false,
            location: 'Klagenfurt',
            status: 'bestaetigt',
          },
        ],
      }),
    );
    render(<CustomerTicketPage shareCode="sc-abc" />);
    await screen.findByText(/Vor-Ort-Reparatur/);
    expect(screen.getByText('Klagenfurt')).toBeInTheDocument();
    expect(screen.getByText('Bestätigt')).toBeInTheDocument();
  });

  it('renders external comments labelled as "Ihre Rückmeldung"', async () => {
    getPublicTicketViewMock.mockResolvedValueOnce(
      makeView({
        timeline: [
          {
            id: 'c-1',
            kind: 'comment',
            body: 'Bitte morgen vormittags anrufen.',
            metadata: null,
            createdAt: '2026-05-12T10:00:00Z',
            isExternal: true,
          },
        ],
      }),
    );
    render(<CustomerTicketPage shareCode="sc-abc" />);
    await screen.findByText('Bitte morgen vormittags anrufen.');
    expect(screen.getByText('Ihre Rückmeldung')).toBeInTheDocument();
  });

  it('hides the comment form once the ticket is closed', async () => {
    getPublicTicketViewMock.mockResolvedValueOnce(
      makeView({
        ticket: {
          ...makeView().ticket,
          status: 'closed',
          closedAt: '2026-05-14T16:00:00Z',
          resolutionNote: 'Toner getauscht.',
        },
      }),
    );
    render(<CustomerTicketPage shareCode="sc-abc" />);
    await screen.findByText('Toner getauscht.');
    expect(screen.queryByRole('button', { name: /Senden/ })).not.toBeInTheDocument();
  });

  it('posts a customer comment via addPublicComment and appends it to the timeline', async () => {
    const u = userEvent.setup();
    getPublicTicketViewMock.mockResolvedValueOnce(makeView());
    addPublicCommentMock.mockResolvedValueOnce({
      id: 'c-new',
      kind: 'comment',
      body: 'Test-Antwort',
      metadata: null,
      createdAt: '2026-05-12T11:00:00Z',
      isExternal: true,
    });
    render(<CustomerTicketPage shareCode="sc-abc" />);
    await screen.findByText('Drucker druckt nicht');
    await u.type(screen.getByPlaceholderText(/Bitte morgen vormittags/), 'Test-Antwort');
    await u.click(screen.getByRole('button', { name: /Senden/ }));
    await waitFor(() =>
      expect(addPublicCommentMock).toHaveBeenCalledWith('sc-abc', 'Test-Antwort'),
    );
    expect(await screen.findByText('Test-Antwort')).toBeInTheDocument();
  });
});
