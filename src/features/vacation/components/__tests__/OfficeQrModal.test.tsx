import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const generateQrDataUrlMock = vi.fn();

vi.mock('../../../../lib/qr', () => ({
  generateQrDataUrl: (text: string, opts?: unknown) => generateQrDataUrlMock(text, opts),
}));

import OfficeQrModal from '../OfficeQrModal';

beforeEach(() => {
  generateQrDataUrlMock.mockReset().mockResolvedValue('data:image/png;base64,FAKE');
});

const URL = 'https://bessa.kitz.co.at/#/leaves';

describe('OfficeQrModal', () => {
  it('renders the URL prominently and asks the qr lib to encode it', async () => {
    render(<OfficeQrModal url={URL} onClose={vi.fn()} />);
    expect(screen.getByText(/Urlaub einreichen/)).toBeInTheDocument();
    expect(screen.getByTestId('office-qr-url').textContent).toBe(URL);
    await waitFor(() => expect(generateQrDataUrlMock).toHaveBeenCalledWith(URL, expect.any(Object)));
    expect(await screen.findByTestId('office-qr-image')).toHaveAttribute('src', 'data:image/png;base64,FAKE');
  });

  it('shows a loading spinner before the QR resolves', () => {
    generateQrDataUrlMock.mockImplementation(() => new Promise(() => {}));
    render(<OfficeQrModal url={URL} onClose={vi.fn()} />);
    expect(screen.getByTestId('office-qr-image-frame')).toBeInTheDocument();
    expect(screen.queryByTestId('office-qr-image')).not.toBeInTheDocument();
  });

  it('renders the failure message when the lib returns null', async () => {
    generateQrDataUrlMock.mockResolvedValue(null);
    render(<OfficeQrModal url={URL} onClose={vi.fn()} />);
    expect(await screen.findByText(/QR konnte nicht erzeugt werden/)).toBeInTheDocument();
  });

  it('uses the initialQrDataUrl prop without calling the lib', async () => {
    render(<OfficeQrModal url={URL} onClose={vi.fn()} initialQrDataUrl="data:fake" />);
    expect(screen.getByTestId('office-qr-image')).toHaveAttribute('src', 'data:fake');
    // Brief microtask to let any rogue effect fire.
    await new Promise((r) => setTimeout(r, 5));
    expect(generateQrDataUrlMock).not.toHaveBeenCalled();
  });

  it('clicking Schließen calls onClose', async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(<OfficeQrModal url={URL} onClose={onClose} initialQrDataUrl="data:fake" />);
    await u.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the X icon calls onClose', async () => {
    const onClose = vi.fn();
    const u = userEvent.setup();
    render(<OfficeQrModal url={URL} onClose={onClose} initialQrDataUrl="data:fake" />);
    await u.click(screen.getByRole('button', { name: 'Dialog schließen' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<OfficeQrModal url={URL} onClose={onClose} initialQrDataUrl="data:fake" />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking the backdrop calls onClose', () => {
    const onClose = vi.fn();
    render(<OfficeQrModal url={URL} onClose={onClose} initialQrDataUrl="data:fake" />);
    const backdrop = document.querySelector('.fixed.inset-0') as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Drucken button calls window.print()', async () => {
    const printSpy = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: printSpy });
    const u = userEvent.setup();
    render(<OfficeQrModal url={URL} onClose={vi.fn()} initialQrDataUrl="data:fake" />);

    await u.click(screen.getByRole('button', { name: /Drucken/ }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });
});
