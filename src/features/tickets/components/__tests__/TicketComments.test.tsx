import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const addCommentMock = vi.fn();
const listCommentsMock = vi.fn();
const listWatchersMock = vi.fn();
const removeWatcherMock = vi.fn();

vi.mock('../../api/ticketApi', () => ({
  addComment: (ticketId: string, body: string, opts: unknown) => addCommentMock(ticketId, body, opts),
  listComments: (ticketId: string) => listCommentsMock(ticketId),
  listWatchers: (ticketId: string) => listWatchersMock(ticketId),
  removeWatcher: (ticketId: string, employeeId: string) => removeWatcherMock(ticketId, employeeId),
}));

const listEmployeesMock = vi.fn();
vi.mock('../../../vacation/api/vacationApi', () => ({
  listEmployees: (opts: unknown) => listEmployeesMock(opts),
}));

import TicketComments from '../TicketComments';
import type { TicketComment } from '../../types';
import type { Employee } from '../../../vacation/types';

function comment(overrides: Partial<TicketComment> = {}): TicketComment {
  return {
    id: 'c-1', ticketId: 't-1', kind: 'comment', body: 'Hallo',
    metadata: null, createdBy: 'emp-a', isExternal: false, isInternal: true,
    createdAt: '2026-07-20T08:00:00Z', _authorName: 'Hannes', ...overrides,
  };
}

function emp(id: string, name: string): Employee {
  return {
    id, code: id, name, standortId: 1, weeklyHours: 38.5,
    employmentType: 'fulltime', active: true,
  } as Employee;
}

const PLACEHOLDER = /Kommentar hinzufügen/;

beforeEach(() => {
  addCommentMock.mockReset().mockResolvedValue(comment({ id: 'c-new', body: 'Neu' }));
  listCommentsMock.mockReset().mockResolvedValue([]);
  listWatchersMock.mockReset().mockResolvedValue([]);
  removeWatcherMock.mockReset().mockResolvedValue(undefined);
  listEmployeesMock.mockReset().mockResolvedValue([emp('emp-b', 'Bettina Bauer'), emp('emp-c', 'Carla Chen')]);
});

describe('TicketComments — visibility toggle', () => {
  it('posts new comments as internal by default', async () => {
    const user = userEvent.setup();
    render(<TicketComments ticketId="t-1" currentEmployeeId="emp-a" />);
    await screen.findByPlaceholderText(PLACEHOLDER);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Interne Notiz');
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    expect(addCommentMock).toHaveBeenCalledWith('t-1', 'Interne Notiz', {
      createdBy: 'emp-a',
      isInternal: true,
      mentions: [],
    });
  });

  it('posts as external when Extern is selected', async () => {
    const user = userEvent.setup();
    render(<TicketComments ticketId="t-1" currentEmployeeId="emp-a" />);
    await screen.findByPlaceholderText(PLACEHOLDER);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'Für den Kunden');
    await user.click(screen.getByRole('button', { name: /Extern/ }));
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    expect(addCommentMock).toHaveBeenCalledWith('t-1', 'Für den Kunden', {
      createdBy: 'emp-a',
      isInternal: false,
      mentions: [],
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

describe('TicketComments — @mentions', () => {
  it('suggests colleagues after "@" and posts the picked mention id', async () => {
    const user = userEvent.setup();
    render(
      <TicketComments
        ticketId="t-1"
        currentEmployeeId="emp-a"
        employees={[emp('emp-b', 'Bettina Bauer'), emp('emp-c', 'Carla Chen')]}
      />,
    );
    await screen.findByPlaceholderText(PLACEHOLDER);

    await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'FYI @Bet');
    // Suggestion popover shows the matching colleague.
    const suggestion = await screen.findByRole('button', { name: 'Bettina Bauer' });
    await user.click(suggestion);

    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    const [, bodyArg, opts] = addCommentMock.mock.calls[0];
    expect(bodyArg).toContain('@Bettina Bauer');
    expect((opts as { mentions: string[] }).mentions).toEqual(['emp-b']);
  });

  it('drops a mention whose @token was deleted before sending', async () => {
    const user = userEvent.setup();
    render(
      <TicketComments ticketId="t-1" currentEmployeeId="emp-a" employees={[emp('emp-b', 'Bettina Bauer')]} />,
    );
    await screen.findByPlaceholderText(PLACEHOLDER);

    const box = screen.getByPlaceholderText(PLACEHOLDER);
    await user.type(box, '@Bet');
    await user.click(await screen.findByRole('button', { name: 'Bettina Bauer' }));
    // Wipe the whole draft, then type something with no mention.
    await user.clear(box);
    await user.type(box, 'Nevermind');
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(addCommentMock).toHaveBeenCalled());
    expect((addCommentMock.mock.calls[0][2] as { mentions: string[] }).mentions).toEqual([]);
  });
});

describe('TicketComments — watchers', () => {
  it('lists watchers and unwatches on click', async () => {
    const user = userEvent.setup();
    listWatchersMock.mockResolvedValue([{ employeeId: 'emp-b', name: 'Bettina Bauer', createdAt: '' }]);
    render(<TicketComments ticketId="t-1" employees={[emp('emp-b', 'Bettina Bauer')]} />);

    await screen.findByText('Beobachter:');
    expect(screen.getByText('Bettina Bauer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Bettina Bauer entfernen/ }));
    await waitFor(() => expect(removeWatcherMock).toHaveBeenCalledWith('t-1', 'emp-b'));
  });
});
