// Browser-Download eines Blobs unter dem gegebenen Dateinamen. Gleiche Mechanik
// wie in DeliveryNoteDetail (Object-URL → <a download> → click → revoke).

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
