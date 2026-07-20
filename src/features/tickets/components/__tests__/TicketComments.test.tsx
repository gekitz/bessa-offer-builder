import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const addCommentMock = vi.fn();
const listCommentsMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  addComment: (ticketId: string, body: string, opts: unknown) => addCommentMock(ticketId, body, opts),
  listComments: (ticketId: string) => listCommentsMock(ticketId),
}));

import TicketComments from '../TicketComments';
import type { TicketComment } from '../../types';

function comment(overrides: Partial<TicketComment> = {}): TicketComment {
  return {
    id: 'c-1', ticketId: 't-1', kind: 'comment', body: 'Hallo',
    metadata: null, createdBy: 'emp-a', isExternal: false, isInternal: true,
    createdAt: '2026-07-20T08:00:00Z', _authorName: 'Hannes', ...overrides,
  };
}

beforeEach(() => {
  addCommentMock.mockReset().mockResolvedValue(comment({ id: 'c-new', body: 'Neu' }));
  listCommentsMock.mockReset().mockResolvedValue([]);
});

describe('TicketComments — visibility toggle', () => {
  it('posts new comments as internal by default', async () => {
    const user = userEvent.setup();
    render(<TicketComments ticketId="t-1" currentEmployeeId="emp-a" />);
    await screen.findByPlaceholderText('Kommentar hinzufügen…');

    await user.type(screen.getByPlaceholderText('Kommentar hinzufügen…'), 'Interne Notiz');
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    expect(addCommentMock).toHaveBeenCalledWith('t-1', 'Interne Notiz', {
      createdBy: 'emp-a',
      isInternal: true,
    });
  });

  it('posts as external when Extern is selected', async () => {
    const user = userEvent.setup();
    render(<TicketComments ticketId="t-1" currentEmployeeId="emp-a" />);
    await screen.findByPlaceholderText('Kommentar hinzufügen…');

    await user.type(screen.getByPlaceholderText('Kommentar hinzufügen…'), 'Für den Kunden');
    await user.click(screen.getByRole('button', { name: /Extern/ }));
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    expect(addCommentMock).toHaveBeenCalledWith('t-1', 'Für den Kunden', {
      createdBy: 'emp-a',
      isInternal: false,
    });
  });

  it('marks internal staff comments with an "Intern" badge on the timeline', async () => {
    listCommentsMock.mockResolvedValue([comment({ isInternal: true })]);
    render(<TicketComments ticketId="t-1" />);

    // Scope to the comment item — the composer toggle also renders "Intern".
    const item = await screen.findByTestId('ticket-comment');
    expect(within(item).getByText('Intern')).toBeInTheDocument();
    expect(within(item).queryByText('Kunde sieht')).not.toBeInTheDocument();
  });

  it('marks external staff comments as customer-visible', async () => {
    listCommentsMock.mockResolvedValue([comment({ isInternal: false })]);
    render(<TicketComments ticketId="t-1" />);

    const item = await screen.findByTestId('ticket-comment');
    expect(within(item).getByText('Kunde sieht')).toBeInTheDocument();
    expect(within(item).queryByText('Intern')).not.toBeInTheDocument();
  });
});
