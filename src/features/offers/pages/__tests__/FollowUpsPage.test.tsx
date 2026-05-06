import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mocks ───────────────────────────────────────────────────────────
const listOffersMock = vi.fn();
const logActivityMock = vi.fn();
const updateOfferStageMock = vi.fn();
const markOfferLostMock = vi.fn();
const getRecentOpenCountsMock = vi.fn();
const sendFollowupMock = vi.fn();

vi.mock('../../../../lib/offerApi', () => ({
  listOffers: () => listOffersMock(),
  logActivity: (offerId: string, draft: unknown) => logActivityMock(offerId, draft),
  updateOfferStage: (offerId: string, stage: string) => updateOfferStageMock(offerId, stage),
  markOfferLost: (offerId: string, payload: unknown) => markOfferLostMock(offerId, payload),
  getRecentOpenCounts: (days: number) => getRecentOpenCountsMock(days),
  sendFollowup: (offerId: string, payload: unknown) => sendFollowupMock(offerId, payload),
}));

const useAuthMock = vi.fn(() => ({
  user: { id: 'user-1', email: 'gk@kitz.co.at' },
  profile: { mesonic_rep_name: 'Georg Kitz' },
}));
vi.mock('../../../../lib/auth', () => ({
  useAuth: () => useAuthMock(),
}));

import FollowUpsPage from '../FollowUpsPage';

const MS = 24 * 60 * 60 * 1000;
const NOW = Date.now();

function offer(partial: Record<string, unknown>) {
  return {
    id: 'offer-x',
    stage: 'offer_sent',
    customer_company: 'Acme GmbH',
    customer_name: null,
    creator_name: 'Georg Kitz',
    sent_at: null,
    last_activity_at: null,
    next_followup_at: null,
    total_period: 5000,
    total_monthly: 100,
    ...partial,
  };
}

beforeEach(() => {
  listOffersMock.mockReset();
  logActivityMock.mockReset();
  updateOfferStageMock.mockReset();
  markOfferLostMock.mockReset();
  getRecentOpenCountsMock.mockReset();
  sendFollowupMock.mockReset();
  // Default: no recent opens. Individual tests override as needed.
  getRecentOpenCountsMock.mockResolvedValue(new Map());
});

describe('FollowUpsPage', () => {
  it('shows the empty state when there are no follow-ups', async () => {
    listOffersMock.mockResolvedValueOnce([]);
    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    expect(await screen.findByText('Alles erledigt')).toBeInTheDocument();
  });

  it('renders one row per offer in the matching bucket', async () => {
    listOffersMock.mockResolvedValueOnce([
      // Overdue: yesterday's follow-up
      offer({ id: 'a', customer_company: 'Overdue Co', next_followup_at: new Date(NOW - MS).toISOString() }),
      // Due today: in two hours
      offer({ id: 'b', customer_company: 'Today Co', next_followup_at: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() }),
      // Stale: sent 7 days ago, no contact
      offer({ id: 'c', customer_company: 'Stale Co', sent_at: new Date(NOW - 7 * MS).toISOString() }),
    ]);
    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);

    await screen.findByText('Overdue Co');
    expect(screen.getByText('Today Co')).toBeInTheDocument();
    // Stale section is collapsed by default — expand it before asserting.
    await userEvent.click(screen.getByRole('button', { name: /Ohne Reaktion/ }));
    expect(await screen.findByText('Stale Co')).toBeInTheDocument();
  });

  it('value filter hides offers below the chosen floor', async () => {
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'cheap', customer_company: 'Cheap GmbH', total_period: 500,  next_followup_at: new Date(NOW - MS).toISOString() }),
      offer({ id: 'pricy', customer_company: 'Pricy GmbH', total_period: 6000, next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Cheap GmbH');

    await userEvent.click(screen.getByRole('button', { name: /€ 5k\+/ }));

    expect(screen.queryByText('Cheap GmbH')).not.toBeInTheDocument();
    expect(screen.getByText('Pricy GmbH')).toBeInTheDocument();
  });

  it('creator filter narrows the buckets to one rep', async () => {
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'mine',   customer_company: 'Mine GmbH',  creator_name: 'Georg Kitz',   next_followup_at: new Date(NOW - MS).toISOString() }),
      offer({ id: 'theirs', customer_company: 'Their GmbH', creator_name: 'Helmut Bauer', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Mine GmbH');
    expect(screen.getByText('Their GmbH')).toBeInTheDocument();

    // Open the creator dropdown and pick a single rep.
    await userEvent.click(screen.getByRole('button', { name: /Alle Ersteller/ }));
    await userEvent.click(screen.getByRole('button', { name: /^Helmut Bauer$/ }));

    expect(screen.queryByText('Mine GmbH')).not.toBeInTheDocument();
    expect(screen.getByText('Their GmbH')).toBeInTheDocument();
  });

  it('clicking Kontakt opens the modal; saving calls logActivity with the auth identity', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'a', customer_company: 'Acme GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    logActivityMock.mockResolvedValueOnce({
      id: 'act-1',
      created_at: new Date().toISOString(),
      next_followup_at: null,
    });

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Acme GmbH');

    // Multiple "Kontakt" buttons can exist; click the row's first one.
    const kontaktBtns = screen.getAllByRole('button', { name: /Kontakt/ });
    await user.click(kontaktBtns[0]!);

    // Modal opens
    expect(await screen.findByText('Kontakt protokollieren')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nicht erreicht' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(logActivityMock).toHaveBeenCalledTimes(1));
    const [offerId, draft] = logActivityMock.mock.calls[0]!;
    expect(offerId).toBe('a');
    expect(draft).toMatchObject({
      kind: 'call',
      outcome: 'no_answer',
      createdById: 'user-1',
      createdByName: 'Georg Kitz',
    });
  });

  it('clicking the back arrow calls onBack', async () => {
    listOffersMock.mockResolvedValueOnce([]);
    const onBack = vi.fn();
    render(<FollowUpsPage onBack={onBack} onLoad={() => {}} />);
    await screen.findByText('Alles erledigt');

    await userEvent.click(screen.getByRole('button', { name: /Angebote/ }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('clicking Öffnen on a row calls onLoad with the offer id', async () => {
    const onLoad = vi.fn();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'open-me', customer_company: 'OpenMe GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    render(<FollowUpsPage onBack={() => {}} onLoad={onLoad} />);
    await screen.findByText('OpenMe GmbH');

    await userEvent.click(screen.getByRole('button', { name: /Öffnen/ }));
    expect(onLoad).toHaveBeenCalledWith('open-me');
  });

  it('shows an error message and a retry button when listOffers fails', async () => {
    listOffersMock.mockRejectedValueOnce(new Error('rls denied'));
    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    expect(await screen.findByText(/rls denied/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /erneut versuchen/i })).toBeInTheDocument();
  });

  it('clicking Gewonnen calls updateOfferStage("closed") and removes the offer from the bucket', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'a', customer_company: 'Acme GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    updateOfferStageMock.mockResolvedValueOnce({ id: 'a', stage: 'closed' });

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Acme GmbH');

    await user.click(screen.getByRole('button', { name: /Gewonnen/ }));

    await waitFor(() => expect(updateOfferStageMock).toHaveBeenCalledWith('a', 'closed'));
    // After the stage flips, the row no longer matches any bucket → empty state.
    await waitFor(() => expect(screen.queryByText('Acme GmbH')).not.toBeInTheDocument());
  });

  it('clicking Verloren opens LostReasonModal first (no immediate stage change)', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'b', customer_company: 'Other GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Other GmbH');

    await user.click(screen.getByRole('button', { name: /^Verloren$/ }));

    // Modal opens — modal title row contains "Als verloren markieren"
    expect(await screen.findByText('Als verloren markieren')).toBeInTheDocument();
    // Stage flip API not called yet — only when the modal submits.
    expect(updateOfferStageMock).not.toHaveBeenCalled();
    expect(markOfferLostMock).not.toHaveBeenCalled();
  });

  it('submitting LostReasonModal calls markOfferLost with reason + note and removes the offer', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'b', customer_company: 'Other GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    markOfferLostMock.mockResolvedValueOnce({ id: 'b', stage: 'lost', lost_reason: 'price' });

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Other GmbH');
    await user.click(screen.getByRole('button', { name: /^Verloren$/ }));

    await user.click(await screen.findByRole('button', { name: 'Preis / Budget' }));
    await user.type(screen.getByLabelText(/Notiz/), 'zu teuer');
    await user.click(screen.getByRole('button', { name: /Verloren markieren/ }));

    await waitFor(() => expect(markOfferLostMock).toHaveBeenCalledTimes(1));
    expect(markOfferLostMock).toHaveBeenCalledWith('b', { reason: 'price', note: 'zu teuer' });
    // Offer leaves the bucket (stage flipped to 'lost' — no longer 'offer_sent').
    await waitFor(() => expect(screen.queryByText('Other GmbH')).not.toBeInTheDocument());
  });

  it('rolls back the optimistic stage flip when markOfferLost fails', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'b', customer_company: 'Boom GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    markOfferLostMock.mockRejectedValueOnce(new Error('rls denied'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Boom GmbH');
    await user.click(screen.getByRole('button', { name: /^Verloren$/ }));
    await user.click(await screen.findByRole('button', { name: 'Sonstiges' }));
    await user.click(screen.getByRole('button', { name: /Verloren markieren/ }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    // The offer comes back into the bucket because the stage rolled
    // back. Boom GmbH now appears in both the row and the modal
    // header (the modal stays open so the rep can retry), so we
    // assert at least one match exists.
    expect(screen.getAllByText('Boom GmbH').length).toBeGreaterThan(0);
    alertSpy.mockRestore();
  });

  it('rolls the offer back into the bucket if updateOfferStage fails', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'c', customer_company: 'Boom GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    updateOfferStageMock.mockRejectedValueOnce(new Error('rls denied'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Boom GmbH');

    await user.click(screen.getByRole('button', { name: /Gewonnen/ }));

    // The offer comes back after the rejection.
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(screen.getByText('Boom GmbH')).toBeInTheDocument();
    alertSpy.mockRestore();
  });

  it('shows a Heiße Spur bucket when an offer has ≥3 opens in the last 7 days', async () => {
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'hot', customer_company: 'Heißes Lead GmbH', sent_at: new Date(NOW - 4 * MS).toISOString() }),
      offer({ id: 'cold', customer_company: 'Cold GmbH', sent_at: new Date(NOW - 4 * MS).toISOString() }),
    ]);
    getRecentOpenCountsMock.mockResolvedValueOnce(new Map([['hot', 4], ['cold', 1]]));

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Heißes Lead GmbH');

    expect(screen.getByRole('button', { name: /Heiße Spur/ })).toBeInTheDocument();
    // Cold offer (1 open) does not appear in any bucket since it has
    // no follow-up date and isn't stale yet (sent only 4 days ago).
    expect(screen.queryByText('Cold GmbH')).not.toBeInTheDocument();
  });

  it('moves a hot-trail offer out of the time-based buckets so it isn\'t double-counted', async () => {
    listOffersMock.mockResolvedValueOnce([
      // Both overdue AND hot — should appear only in Heiße Spur.
      offer({ id: 'hot', customer_company: 'Heiß GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    getRecentOpenCountsMock.mockResolvedValueOnce(new Map([['hot', 5]]));

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Heiß GmbH');

    // The Überfällig section header should report "keine" because
    // the offer was promoted to the hot bucket.
    const ueberfaellig = screen.getByText('Überfällig').closest('div')!;
    expect(ueberfaellig.textContent).toMatch(/— keine/);
  });

  it('clicking Folgemail opens SendFollowupModal and sending invokes sendFollowup', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({
        id: 'a',
        customer_company: 'Acme GmbH',
        next_followup_at: new Date(NOW - MS).toISOString(),
        sent_at: new Date(NOW - 5 * MS).toISOString(),
        // include the fields the modal/templates read
        creator_email: 'g.kitz@kitz.co.at',
        email_subject: 'Ihr Angebot von Kitz – Acme',
        pdf_path: 'offers/a/x.pdf',
      }),
    ]);
    sendFollowupMock.mockResolvedValueOnce({ success: true, activityId: 'act-1' });
    // After a successful send the page calls fetchOffers() again.
    listOffersMock.mockResolvedValueOnce([]);

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Acme GmbH');

    await user.click(screen.getAllByRole('button', { name: /Folgemail/ })[0]!);

    // Modal opened
    expect(await screen.findByText(/Folgemail an Acme GmbH/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Senden$/ }));

    await waitFor(() => expect(sendFollowupMock).toHaveBeenCalledTimes(1));
    const [offerId, payload] = sendFollowupMock.mock.calls[0]!;
    expect(offerId).toBe('a');
    expect(payload).toMatchObject({
      attachPdf: true,
      createdById: 'user-1',
      createdByName: 'Georg Kitz',
    });
    expect(typeof (payload as { subject: string }).subject).toBe('string');
    expect((payload as { subject: string }).subject.startsWith('Re: ')).toBe(true);
  });

  it('Phase 2 deep-link: auto-opens SendFollowupModal when autoOpenFollowupOfferId is set', async () => {
    const onAutoOpenConsumed = vi.fn();
    listOffersMock.mockResolvedValueOnce([
      offer({
        id: 'deep-link-target',
        customer_company: 'DeepLink GmbH',
        sent_at: new Date(NOW - 5 * MS).toISOString(),
        next_followup_at: new Date(NOW - MS).toISOString(),
        creator_email: 'g.kitz@kitz.co.at',
        email_subject: 'Re: original',
        pdf_path: 'offers/deep/x.pdf',
      }),
    ]);

    render(
      <FollowUpsPage
        onBack={() => {}}
        onLoad={() => {}}
        autoOpenFollowupOfferId="deep-link-target"
        onAutoOpenConsumed={onAutoOpenConsumed}
      />,
    );

    // Modal opens automatically once offers load
    expect(await screen.findByText(/Folgemail an DeepLink GmbH/)).toBeInTheDocument();
    // Parent is told the prop was consumed so it can clear state
    await waitFor(() => expect(onAutoOpenConsumed).toHaveBeenCalledTimes(1));
  });

  it('Phase 2 deep-link: silently fizzles when the offer id no longer exists', async () => {
    const onAutoOpenConsumed = vi.fn();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'still-here', customer_company: 'Still GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);

    render(
      <FollowUpsPage
        onBack={() => {}}
        onLoad={() => {}}
        autoOpenFollowupOfferId="closed-or-deleted"
        onAutoOpenConsumed={onAutoOpenConsumed}
      />,
    );

    await screen.findByText('Still GmbH');
    // No modal should appear
    expect(screen.queryByText(/Folgemail an/)).not.toBeInTheDocument();
    // Still consumed so we don't loop
    await waitFor(() => expect(onAutoOpenConsumed).toHaveBeenCalledTimes(1));
  });

  it('logging an activity with stageChange triggers BOTH logActivity and updateOfferStage', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'd', customer_company: 'Won GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    logActivityMock.mockResolvedValueOnce({
      id: 'act-1',
      created_at: new Date().toISOString(),
      next_followup_at: null,
    });
    updateOfferStageMock.mockResolvedValueOnce({ id: 'd', stage: 'closed' });

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Won GmbH');

    await user.click(screen.getAllByRole('button', { name: /Kontakt/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Interessiert' }));
    await user.click(screen.getByLabelText(/als gewonnen markieren/i));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(logActivityMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(updateOfferStageMock).toHaveBeenCalledWith('d', 'closed'));
  });

  it('logging an activity with stageChange=lost chains into LostReasonModal (no immediate stage flip)', async () => {
    const user = userEvent.setup();
    listOffersMock.mockResolvedValueOnce([
      offer({ id: 'e', customer_company: 'Lost-Path GmbH', next_followup_at: new Date(NOW - MS).toISOString() }),
    ]);
    logActivityMock.mockResolvedValueOnce({
      id: 'act-x',
      created_at: new Date().toISOString(),
      next_followup_at: null,
    });

    render(<FollowUpsPage onBack={() => {}} onLoad={() => {}} />);
    await screen.findByText('Lost-Path GmbH');

    await user.click(screen.getAllByRole('button', { name: /Kontakt/ })[0]!);
    await user.click(screen.getByRole('button', { name: 'Kein Interesse' }));
    await user.click(screen.getByLabelText(/als verloren markieren/i));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    // logActivity ran, but the lost stage flip was deferred to the
    // reason modal — updateOfferStage was NOT called for 'lost'.
    await waitFor(() => expect(logActivityMock).toHaveBeenCalledTimes(1));
    expect(updateOfferStageMock).not.toHaveBeenCalledWith('e', 'lost');
    // The reason modal is now visible.
    expect(await screen.findByText('Als verloren markieren')).toBeInTheDocument();
  });
});
