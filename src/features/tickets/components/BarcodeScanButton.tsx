import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { AlertCircle, Loader2, ScanLine, SwitchCamera, X } from 'lucide-react';

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

async function listVideoInputs(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

// Pick the main rear lens from an enumerated camera list. Android exposes
// several back cameras and often maps facingMode:environment to the FIXED-FOCUS
// ultra-wide, which can't focus on a close barcode. Labels only populate after
// camera permission is granted. Returns null when there's nothing better to
// switch to (single camera / no labels).
function pickRearCamera(cams: MediaDeviceInfo[]): string | null {
  if (cams.length <= 1) return null;
  const back = cams.filter((c) => /back|rear|rück|environment/i.test(c.label));
  const pool = back.length ? back : cams;
  // Skip the fixed-focus ultra-wide / tele / depth / macro lenses.
  const main = pool.find((c) => !/wide|ultra|tele|depth|macro|zoom|weit/i.test(c.label));
  return (main ?? pool[0])?.deviceId ?? null;
}

// Tap-to-focus on a live track: point the autofocus at the tapped spot (0..1
// normalised) and trigger a single-shot refocus. Capability-gated — silently
// no-ops on cameras/browsers without focus control. Types for focusMode/
// pointsOfInterest aren't in the TS DOM lib, so this works loosely.
async function focusTrackAt(track: MediaStreamTrack, x: number, y: number): Promise<void> {
  const caps = (track.getCapabilities?.() ?? {}) as Record<string, unknown>;
  const adv: Record<string, unknown> = {};
  if (caps.pointsOfInterest) adv.pointsOfInterest = [{ x, y }];
  const modes = (caps.focusMode as string[] | undefined) ?? [];
  if (modes.includes('single-shot')) adv.focusMode = 'single-shot';
  else if (modes.includes('continuous')) adv.focusMode = 'continuous';
  if (Object.keys(adv).length === 0) return;
  try {
    await track.applyConstraints({ advanced: [adv] } as unknown as MediaTrackConstraints);
  } catch {
    /* unsupported — ignore */
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
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // null = auto (facingMode:environment + main-lens heuristic); a string once
  // the user manually switches cameras. Changing it re-acquires the stream.
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  // Transient tap-to-focus ring (screen coords within the video box).
  const [focusPulse, setFocusPulse] = useState<{ x: number; y: number } | null>(null);

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
          stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(deviceId ?? undefined), audio: false });
          if (stopped) return;
          // Populate the camera list (labels are available now) and — only on the
          // first open (deviceId still auto) — switch to the main rear lens,
          // avoiding Android's fixed-focus ultra-wide.
          try {
            const cams = await listVideoInputs();
            if (!stopped) setCameras(cams);
            if (deviceId == null) {
              const id = pickRearCamera(cams);
              const currentId = stream.getVideoTracks()[0]?.getSettings().deviceId;
              if (id && id !== currentId) {
                stream.getTracks().forEach((t) => t.stop());
                stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(id), audio: false });
              }
            }
          } catch {
            /* keep the first stream */
          }
          if (stopped) return;
          trackRef.current = stream.getVideoTracks()[0] ?? null;
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
          // Fallback: @zxing/browser opens the camera and drives its own decode
          // loop, attaching the stream to our <video>.
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          if (stopped || !videoRef.current) return;
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromConstraints(
            { video: videoConstraints(deviceId ?? undefined), audio: false },
            videoRef.current,
            (result) => {
              if (result) handleHit(result.getText());
            },
          );
          const so = videoRef.current.srcObject;
          if (so instanceof MediaStream) {
            trackRef.current = so.getVideoTracks()[0] ?? null;
            void enableAutofocus(so);
          }
          if (!stopped) setCameras(await listVideoInputs());
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
      trackRef.current = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };
  }, [onScan, deviceId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Tap the preview to refocus at that point.
  function handleTapFocus(e: MouseEvent<HTMLDivElement>) {
    const track = trackRef.current;
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    setFocusPulse({ x: px, y: py });
    window.setTimeout(() => setFocusPulse(null), 700);
    if (track) void focusTrackAt(track, Math.min(1, Math.max(0, px / box.width)), Math.min(1, Math.max(0, py / box.height)));
  }

  // Cycle to the next camera (manual escape hatch from a fixed-focus lens).
  function switchCamera() {
    if (cameras.length < 2) return;
    const curId = trackRef.current?.getSettings().deviceId ?? deviceId;
    const idx = cameras.findIndex((c) => c.deviceId === curId);
    const next = cameras[(idx + 1) % cameras.length];
    if (!next) return;
    setError(null);
    setStarting(true);
    setDeviceId(next.deviceId);
  }

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

        <div className="relative bg-slate-900 aspect-[4/3] cursor-pointer" onClick={handleTapFocus}>
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
          {focusPulse && (
            <div
              className="pointer-events-none absolute w-14 h-14 -ml-7 -mt-7 rounded-full border-2 border-white animate-ping"
              style={{ left: focusPulse.x, top: focusPulse.y }}
            />
          )}
          {!starting && !error && cameras.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); switchCamera(); }}
              className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              aria-label="Kamera wechseln"
              title="Kamera wechseln"
            >
              <SwitchCamera size={18} />
            </button>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-white">
              <AlertCircle size={22} className="text-rose-300" />
              <span className="text-sm">{error}</span>
            </div>
          )}
        </div>

        <div className="px-4 py-3 text-center text-xs text-slate-500">
          Zum Scharfstellen auf das Bild tippen{cameras.length > 1 ? ' · Symbol unten rechts wechselt die Kamera' : ''}.
        </div>
      </div>
    </div>
  );
}
