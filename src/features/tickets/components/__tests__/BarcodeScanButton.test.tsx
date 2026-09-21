import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import BarcodeScanButton from '../BarcodeScanButton';

// A camera track that records whether it was stopped and reports a deviceId.
function makeTrack(deviceId: string) {
  return {
    stopped: false,
    stop() {
      this.stopped = true;
    },
    getSettings: () => ({ deviceId }),
    getCapabilities: () => ({}),
    applyConstraints: () => Promise.resolve(),
  };
}

function makeStream(deviceId: string) {
  const track = makeTrack(deviceId);
  return {
    _track: track,
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

// A NotReadableError like Chromium throws ("Starting videoinput failed").
function notReadable() {
  const e = new Error('Starting videoinput failed');
  e.name = 'NotReadableError';
  return e;
}

let getUserMedia: ReturnType<typeof vi.fn>;
let enumerateDevices: ReturnType<typeof vi.fn>;

function installMediaDevices(devices: Array<{ deviceId: string; label: string }>) {
  getUserMedia = vi.fn();
  enumerateDevices = vi.fn().mockResolvedValue(
    devices.map((d) => ({ ...d, kind: 'videoinput' })),
  );
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices },
  });
}

async function openScanner() {
  await userEvent.click(screen.getByRole('button', { name: 'Barcode scannen' }));
}

beforeEach(() => {
  // Native BarcodeDetector path; detector never finds a code so the modal stays open.
  (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = class {
    detect() {
      return Promise.resolve([]);
    }
  };
  // jsdom lacks <video>.play / srcObject.
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: () => Promise.resolve(),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  });
});

afterEach(() => {
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  vi.restoreAllMocks();
});

describe('BarcodeScanButton camera start', () => {
  it('retries a transient "Starting videoinput failed" and recovers without an error', async () => {
    installMediaDevices([{ deviceId: 'cam0', label: 'camera' }]);
    // First acquire fails with the Samsung camera-busy race; the retry succeeds.
    getUserMedia
      .mockRejectedValueOnce(notReadable())
      .mockResolvedValue(makeStream('cam0'));

    render(<BarcodeScanButton onScan={vi.fn()} />);
    await openScanner();

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/nicht gestartet|videoinput/i)).not.toBeInTheDocument();
  });

  it('falls back to the default camera when switching to the main rear lens fails', async () => {
    installMediaDevices([
      { deviceId: 'ultra', label: 'back ultra-wide camera' },
      { deviceId: 'main', label: 'back camera' },
    ]);
    getUserMedia
      // 1) initial auto acquire → ultra-wide
      .mockResolvedValueOnce(makeStream('ultra'))
      // 2+3) switch to main lens keeps failing (past the retry budget)
      .mockRejectedValueOnce(notReadable())
      .mockRejectedValueOnce(notReadable())
      .mockRejectedValueOnce(notReadable())
      // 4) fallback to default camera succeeds
      .mockResolvedValue(makeStream('ultra'));

    render(<BarcodeScanButton onScan={vi.fn()} />);
    await openScanner();

    await waitFor(() => expect(getUserMedia.mock.calls.length).toBeGreaterThanOrEqual(5));
    // The chosen lens was attempted with an exact deviceId...
    expect(
      getUserMedia.mock.calls.some(([c]) => {
        const dev = (c as { video?: { deviceId?: { exact?: string } } })?.video?.deviceId;
        return dev?.exact === 'main';
      }),
    ).toBe(true);
    // ...and the modal recovered rather than showing an error.
    expect(screen.queryByText(/nicht gestartet|videoinput/i)).not.toBeInTheDocument();
  });

  it('shows a friendly German message when the camera genuinely cannot start', async () => {
    installMediaDevices([{ deviceId: 'cam0', label: 'camera' }]);
    getUserMedia.mockRejectedValue(notReadable());

    render(<BarcodeScanButton onScan={vi.fn()} />);
    await openScanner();

    await waitFor(() =>
      expect(screen.getByText(/Kamera konnte nicht gestartet werden/i)).toBeInTheDocument(),
    );
    // The raw Chromium string never reaches the user.
    expect(screen.queryByText(/Starting videoinput failed/i)).not.toBeInTheDocument();
  });

  it('surfaces a denied-permission error distinctly', async () => {
    installMediaDevices([{ deviceId: 'cam0', label: 'camera' }]);
    const denied = new Error('Permission denied');
    denied.name = 'NotAllowedError';
    getUserMedia.mockRejectedValue(denied);

    render(<BarcodeScanButton onScan={vi.fn()} />);
    await openScanner();

    await waitFor(() =>
      expect(screen.getByText('Kamerazugriff wurde verweigert.')).toBeInTheDocument(),
    );
  });
});
