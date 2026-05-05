import QRCode from 'qrcode';

export async function generateAcceptQr(shareCode) {
  if (!shareCode) return null;
  const base = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;
  const url = `${base}/?a=${shareCode}`;
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
}

// Generic helper used by the office-print QR. Returns a data URL for
// any string the caller passes in (typically a deep-link URL).
export async function generateQrDataUrl(text, opts = {}) {
  if (!text) return null;
  try {
    return await QRCode.toDataURL(text, {
      margin: 1,
      width: opts.width ?? 480,
      errorCorrectionLevel: opts.errorCorrectionLevel ?? 'M',
    });
  } catch {
    return null;
  }
}
