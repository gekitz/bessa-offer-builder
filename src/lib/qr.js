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
