import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SendFollowupModal from '../SendFollowupModal';
import type { TemplateOfferShape } from '../../../data/followupTemplates';

const MS = 24 * 60 * 60 * 1000;

function makeOffer(p: Partial<TemplateOfferShape> = {}): TemplateOfferShape {
  return {
    id: 'off-1',
    customer_name: 'Max Mustermann',
    customer_company: 'ACME GmbH',
    creator_name: 'Georg Kitz',
    creator_email: 'g.kitz@kitz.co.at',
    total_monthly: 60,
    total_period: 720,
    total_once: 1500,
    sent_at: new Date(Date.now() - 4 * MS).toISOString(),
    email_subject: 'Ihr Angebot von Kitz Computer & Office GmbH – ACME GmbH',
    ...p,
  };
}

function renderModal(overrides: Partial<React.ComponentProps<typeof SendFollowupModal>> = {}) {
  const onSubmit = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <SendFollowupModal
      offer={makeOffer()}
      onSubmit={onSubmit}
      onClose={onClose}
      pdfAvailable
      acceptLinkAvailable
      {...overrides}
    />,
  );
  return { onSubmit, onClose, ...utils };
}

describe('SendFollowupModal', () => {
  it('renders all five template chips', () => {
    renderModal();
    for (const label of ['Zustellung prüfen', 'Sanfte Erinnerung', 'Mehrwert hervorheben', 'Abschluss-Mail', 'Frei formulieren']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('auto-selects sanity_check for a fresh send with no opens', () => {
    renderModal({ offer: makeOffer({ sent_at: new Date(Date.now() - 4 * MS).toISOString() }), recentOpens: 0 });
    const subject = screen.getByLabelText('Betreff') as HTMLInputElement;
    expect(subject.value).toContain('Re: ');
    const body = screen.getByLabelText('Nachricht') as HTMLTextAreaElement;
    expect(body.value).toContain('im Spam-Ordner');
  });

  it('auto-selects breakup for an offer sent 21+ days ago', () => {
    renderModal({ offer: makeOffer({ sent_at: new Date(Date.now() - 30 * MS).toISOString() }) });
    const body = screen.getByLabelText('Nachricht') as HTMLTextAreaElement;
    expect(body.value).toContain('keine Priorität');
  });

  it('switching template regenerates subject and body (clobbers manual edits)', async () => {
    const user = userEvent.setup();
    renderModal();

    const body = screen.getByLabelText('Nachricht') as HTMLTextAreaElement;
    await user.clear(body);
    await user.type(body, 'manuell überschrieben');
    expect(body.value).toBe('manuell überschrieben');

    await user.click(screen.getByRole('button', { name: 'Abschluss-Mail' }));

    expect(body.value).not.toBe('manuell überschrieben');
    expect(body.value).toContain('keine Priorität');
  });

  it('passes the edited subject/body and toggle states to onSubmit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    const subject = screen.getByLabelText('Betreff') as HTMLInputElement;
    await user.clear(subject);
    await user.type(subject, 'Re: Mein Betreff');

    const body = screen.getByLabelText('Nachricht') as HTMLTextAreaElement;
    await user.clear(body);
    await user.type(body, 'Mein Body');

    await user.click(screen.getByRole('button', { name: /Senden/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      subject: 'Re: Mein Betreff',
      body: 'Mein Body',
      attachPdf: true,
      includeAcceptLink: true,
    }));
  });

  it('PDF toggle defaults to ON when pdfAvailable, can be turned off', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderModal();

    const checkbox = screen.getByRole('checkbox', { name: /PDF anhängen/ });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: /Senden/ }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ attachPdf: false }));
  });

  it('hides PDF toggle entirely when no PDF is available', () => {
    renderModal({ pdfAvailable: false });
    expect(screen.queryByText(/PDF anhängen/)).not.toBeInTheDocument();
  });

  it('Annahme-Link toggle is disabled when acceptLinkAvailable is false', () => {
    renderModal({ acceptLinkAvailable: false });
    const checkbox = screen.getByRole('checkbox', { name: /Annahme-Link einbinden/ });
    expect(checkbox).toBeDisabled();
    expect(checkbox).not.toBeChecked();
  });

  it('Send button is disabled while saving', async () => {
    renderModal({ saving: true });
    const sendBtn = await screen.findByRole('button', { name: /Wird gesendet/ });
    expect(sendBtn).toBeDisabled();
  });

  it('clicking the close X invokes onClose unless saving', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    await user.click(screen.getByLabelText('Schließen'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClose while saving (so the user cannot mid-send dismiss)', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({ saving: true });
    await user.click(screen.getByLabelText('Schließen'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('uses the persisted email_subject for threading (Re: prefix preserved)', async () => {
    renderModal({ offer: makeOffer({ email_subject: 'Sonderkonditionen für ACME — Q2' }) });
    await waitFor(() => {
      const subject = screen.getByLabelText('Betreff') as HTMLInputElement;
      expect(subject.value).toBe('Re: Sonderkonditionen für ACME — Q2');
    });
  });

  it('does not double-prefix Re: when source already has it', async () => {
    renderModal({ offer: makeOffer({ email_subject: 'Re: Bereits prefixed' }) });
    await waitFor(() => {
      const subject = screen.getByLabelText('Betreff') as HTMLInputElement;
      expect(subject.value).toBe('Re: Bereits prefixed');
    });
  });
});
