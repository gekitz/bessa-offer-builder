import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, ScanLine, X } from 'lucide-react';

// Camera barcode scanner for serial-number capture on the Lieferschein.
// Prefers the native BarcodeDetector API (Android/Chrome); lazily falls back to
// @zxing/browser (iOS Safari and other browsers that lack BarcodeDetector).
// See docs/ticket-lieferschein.md.

interface BarcodeScanButtonProps {
  onScan: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

// The native BarcodeDetector isn't in the TS DOM lib — declare the slice we use.
interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATS = [
  'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'qr_code', 'data_matrix', 'itf', 'codabar',
];

// Video constraints tuned for close-range barcode scanning. A high ideal
// resolution nudges Android toward the main sensor (not the low-res ultra-wide),
// and continuous focus keeps a close barcode sharp. focusMode isn't in the TS
// DOM lib, so the constraint set is built loosely and cast.
function videoConstraints(deviceId?: string): MediaTrackConstraints {
  const c: Record<string, unknown> = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    advanced: [{ focusMode: 'continuous' }],
  };
  if (deviceId) c.deviceId = { exact: deviceId };
  else c.facingMode = { ideal: 'environment' };
  return c as MediaTrackConstraints;
}

// Pick the main rear lens. Android exposes several back cameras and often maps
// facingMode:environment to the FIXED-FOCUS ultra-wide, which can't focus on a
// close barcode. Labels only populate after camera permission is granted, so
// this runs after the first getUserMedia. Returns null when there's nothing
// better to switch to (single camera / no labels).
async function pickRearCameraId(): Promise<string | null> {
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    if (cams.length <= 1) return null;
    const back = cams.filter((c) => /back|rear|rück|environment/i.test(c.label));
    const pool = back.length ? back : cams;
    // Skip the fixed-focus ultra-wide / tele / depth / macro lenses.
    const main = pool.find((c) => !/wide|ultra|tele|depth|macro|zoom|weit/i.test(c.label));
    return (main ?? pool[0])?.deviceId ?? null;
  } catch {
    return null;
  }
}

// Best-effort continuous autofocus on an already-open track (some browsers only
// honour focusMode via applyConstraints, not the initial getUserMedia).
async function enableAutofocus(stream: MediaStream): Promise<void> {
  try {
    await stream.getVideoTracks()[0]?.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints);
  } catch {
    /* unsupported — ignore */
  }
}

export default function BarcodeScanButton({
  onScan,
  disabled = false,
  ariaLabel = 'Barcode scannen',
  className = '',
}: BarcodeScanButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`rounded-md p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-40 ${className}`}
      >
        <ScanLine size={14} />
      </button>
      {open && (
        <ScannerModal
          onClose={() => setOpen(false)}
          onScan={(v) => {
            onScan(v);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function ScannerModal({ onScan, onClose }: { onScan: (v: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    // @zxing/browser IScannerControls (only .stop() is used).
    let zxingControls: { stop: () => void } | null = null;

    function handleHit(value: string) {
      if (stopped || !value) return;
      stopped = true;
      onScan(value.trim());
    }

    async function start() {
      try {
        const Ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (Ctor) {
          // Native path: we own the stream and poll the detector on each frame.
          stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
          if (stopped) return;
          // Switch to the main rear lens if a better one exists (avoids Android's
          // fixed-focus ultra-wide, which can't focus on a close barcode).
          try {
            const id = await pickRearCameraId();
            const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
            if (id && id !== currentId) {
              stream.getTracks().forEach((t) => t.stop());
              stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(id), audio: false });
            }
          } catch {
            /* keep the first stream */
          }
          if (stopped) return;
          await enableAutofocus(stream);
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play().catch(() => {/* autoplay quirks — ignore */});
          setStarting(false);

          const detector = new Ctor({ formats: FORMATS });
          intervalId = setInterval(async () => {
            if (stopped || !videoRef.current) return;
            try {
              const hits = await detector.detect(videoRef.current);
              if (hits && hits.length > 0) handleHit(hits[0]!.rawValue);
            } catch {
              /* transient decode error — keep polling */
            }
          }, 350);
        } else {
          // Fallback: @zxing/browser opens the (rear) camera and drives its own
          // decode loop, attaching the stream to our <video>.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped || !videoRef.current) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: videoConstraints(), audio: false },
            videoRef.current,
            (result) => {
              if (result) handleHit(result.getText());
            },
          );
          if (videoRef.current.srcObject instanceof MediaStream) {
            void enableAutofocus(videoRef.current.srcObject);
          }
          setStarting(false);
        }
      } catch (e) {
        const name = (e as { name?: string })?.name;
        if (name === 'NotAllowedError') setError('Kamerazugriff wurde verweigert.');
        else if (name === 'NotFoundError') setError('Keine Kamera gefunden.');
        else setError(e instanceof Error ? e.message : String(e));
        setStarting(false);
      }
    }

    void start();

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      try { zxingControls?.stop(); } catch { /* noop */ }
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [onScan]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl bg-white overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <ScanLine size={16} className="text-slate-500" />
            Barcode scannen
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative bg-slate-900 aspect-[4/3]">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white/80">
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}
          {!starting && !error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-3/4 h-1/3 border-2 border-white/70 rounded-lg" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
              <AlertCircle size={22} className="text-rose-300" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 text-center text-xs text-slate-500">
          Barcode am Gerät/Karton in den Rahmen halten.
        </div>
      </div>
    </div>
  );
}
