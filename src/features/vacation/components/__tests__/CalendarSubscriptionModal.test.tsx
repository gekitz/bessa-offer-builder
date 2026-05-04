import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const getCalendarTokenMock = vi.fn();
const regenerateCalendarTokenMock = vi.fn();

vi.mock('../../api/vacationApi', () => ({
  getCalendarToken: (id: string) => getCalendarTokenMock(id),
  regenerateCalendarToken: (id: string) => regenerateCalendarTokenMock(id),
}));

import CalendarSubscriptionModal from '../CalendarSubscriptionModal';

const SUPABASE_URL = 'https://test.supabase.co';
const TOKEN_A = '11111111-1111-1111-1111-111111111111';
const TOKEN_B = '22222222-2222-2222-2222-222222222222';

beforeEach(() => {
  getCalendarTokenMock.mockReset();
  regenerateCalendarTokenMock.mockReset();
});

function renderModal(overrides: Partial<React.ComponentProps<typeof CalendarSubscriptionModal>> = {}) {
  return render(
    <CalendarSubscriptionModal
      employeeId="emp-1"
      employeeName="Stefan Bauer"
      onClose={vi.fn()}
      supabaseUrlOverride={SUPABASE_URL}
      {...overrides}
    />,
  );
}

describe('CalendarSubscriptionModal', () => {
  it('shows a loading indicator before the token resolves', () => {
    getCalendarTokenMock.mockImplementation(() => new Promise(() => {}));
    renderModal();
    expect(screen.getByText(/URL wird geladen/i)).toBeInTheDocument();
  });

  it('renders the URL with the loaded token after fetch', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    renderModal();
    const input = await screen.findByLabelText('Kalender-Abo-URL') as HTMLInputElement;
    expect(input.value).toBe(`${SUPABASE_URL}/functions/v1/calendar-feed?token=${TOKEN_A}`);
  });

  it('includes the employee name in the description', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    renderModal({ employeeName: 'Mario Graf' });
    expect(await screen.findByText('Mario Graf')).toBeInTheDocument();
  });

  it('renders the API error inline when the token lookup fails', async () => {
    getCalendarTokenMock.mockRejectedValue(new Error('rls denied'));
    renderModal();
    expect(await screen.findByText(/rls denied/i)).toBeInTheDocument();
  });

  it('copies the URL to the clipboard when "Kopieren" is clicked', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);

    const u = userEvent.setup();
    // userEvent.setup() installs its own clipboard polyfill, so we
    // override AFTER setup runs.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    renderModal();

    await screen.findByLabelText('Kalender-Abo-URL');
    await u.click(screen.getByRole('button', { name: /URL kopieren/i }));

    expect(writeText).toHaveBeenCalledWith(`${SUPABASE_URL}/functions/v1/calendar-feed?token=${TOKEN_A}`);
    expect(await screen.findByText('Kopiert')).toBeInTheDocument();
  });

  it('regenerate replaces the displayed URL with the new token', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    regenerateCalendarTokenMock.mockResolvedValue(TOKEN_B);

    const u = userEvent.setup();
    renderModal();

    const input = await screen.findByLabelText('Kalender-Abo-URL') as HTMLInputElement;
    expect(input.value).toContain(TOKEN_A);

    await u.click(screen.getByRole('button', { name: /URL zurücksetzen/i }));

    await waitFor(() => {
      const updated = screen.getByLabelText('Kalender-Abo-URL') as HTMLInputElement;
      expect(updated.value).toContain(TOKEN_B);
      expect(updated.value).not.toContain(TOKEN_A);
    });
    expect(regenerateCalendarTokenMock).toHaveBeenCalledWith('emp-1');
  });

  it('renders the regenerate API error inline', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    regenerateCalendarTokenMock.mockRejectedValue(new Error('rotate failed'));

    const u = userEvent.setup();
    renderModal();
    await screen.findByLabelText('Kalender-Abo-URL');

    await u.click(screen.getByRole('button', { name: /URL zurücksetzen/i }));
    expect(await screen.findByText(/rotate failed/i)).toBeInTheDocument();
  });

  it('clicking the close (X) button calls onClose', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    const onClose = vi.fn();
    const u = userEvent.setup();
    renderModal({ onClose });

    await screen.findByLabelText('Kalender-Abo-URL');
    await u.click(screen.getByRole('button', { name: 'Dialog schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the Schließen footer button calls onClose', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    const onClose = vi.fn();
    const u = userEvent.setup();
    renderModal({ onClose });

    await screen.findByLabelText('Kalender-Abo-URL');
    await u.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop calls onClose', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    const onClose = vi.fn();
    renderModal({ onClose });

    await screen.findByLabelText('Kalender-Abo-URL');
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking inside the modal does not call onClose', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    const onClose = vi.fn();
    renderModal({ onClose });

    const input = await screen.findByLabelText('Kalender-Abo-URL');
    fireEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape key calls onClose', async () => {
    getCalendarTokenMock.mockResolvedValue(TOKEN_A);
    const onClose = vi.fn();
    renderModal({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
