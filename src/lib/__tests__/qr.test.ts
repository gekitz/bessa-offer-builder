import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import QRCode from 'qrcode';
import { generateAcceptQr } from '../qr';

vi.mock('qrcode', () => ({
  default: { toDataURL: vi.fn() },
}));

const toDataURL = QRCode.toDataURL as unknown as ReturnType<typeof vi.fn>;

describe('generateAcceptQr', () => {
  beforeEach(() => {
    toDataURL.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns null when shareCode is missing', async () => {
    expect(await generateAcceptQr('')).toBeNull();
    expect(await generateAcceptQr(null as unknown as string)).toBeNull();
    expect(await generateAcceptQr(undefined as unknown as string)).toBeNull();
    expect(toDataURL).not.toHaveBeenCalled();
  });

  it('builds the accept URL from VITE_PUBLIC_APP_URL when set', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', 'https://offer.kitz.example');
    toDataURL.mockResolvedValue('data:image/png;base64,AAA');

    const result = await generateAcceptQr('abc123');

    expect(result).toBe('data:image/png;base64,AAA');
    expect(toDataURL).toHaveBeenCalledWith(
      'https://offer.kitz.example/?a=abc123',
      { margin: 1, width: 240, errorCorrectionLevel: 'M' },
    );
  });

  it('falls back to window.location.origin when VITE_PUBLIC_APP_URL is unset', async () => {
    vi.stubEnv('VITE_PUBLIC_APP_URL', '');
    toDataURL.mockResolvedValue('data:image/png;base64,BBB');

    const result = await generateAcceptQr('xyz789');

    expect(result).toBe('data:image/png;base64,BBB');
    const [calledUrl] = toDataURL.mock.calls[0];
    expect(calledUrl).toBe(`${window.location.origin}/?a=xyz789`);
  });

  it('returns null when QRCode.toDataURL throws', async () => {
    toDataURL.mockRejectedValue(new Error('boom'));
    const result = await generateAcceptQr('abc123');
    expect(result).toBeNull();
  });
});
