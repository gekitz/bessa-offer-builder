import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Download,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  deleteAttachment,
  getAttachmentSignedUrl,
  listAttachments,
  uploadAttachment,
} from '../api/ticketApi';
import type { TicketAttachment } from '../types';

type AttachmentScope = { ticketId: string } | { repairOrderId: string };

interface AttachmentsPanelProps {
  scope: AttachmentScope;
  currentEmployeeId?: string | null;
  // When false (e.g. signed repair order), upload + delete are hidden
  // and the list is read-only.
  editable?: boolean;
}

function isImage(contentType: string | null): boolean {
  return !!contentType && contentType.startsWith('image/');
}

function humanSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsPanel({
  scope,
  currentEmployeeId = null,
  editable = true,
}: AttachmentsPanelProps) {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAttachments(scope);
      setAttachments(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [
    'ticketId' in scope ? scope.ticketId : undefined,
    'repairOrderId' in scope ? scope.repairOrderId : undefined,
  ]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      // Upload sequentially so a single mid-batch failure tells the
      // user which file errored, rather than swallowing it in a
      // Promise.all aggregate.
      for (const file of Array.from(files)) {
        const created = await uploadAttachment({
          ...scope,
          file,
          filename: file.name,
          uploadedBy: currentEmployeeId ?? undefined,
        });
        setAttachments((prev) => [...prev, created]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected if needed.
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  async function handleOpen(a: TicketAttachment) {
    try {
      const url = await getAttachmentSignedUrl(a.storagePath, 3600);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(a: TicketAttachment) {
    if (!window.confirm(`Anhang "${a.filename}" wirklich löschen?`)) return;
    setError(null);
    try {
      await deleteAttachment(a.id);
      setAttachments((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-2" data-testid="attachments-panel">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip size={14} className="text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">
            Anhänge ({attachments.length})
          </span>
        </div>
        {editable && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 sm:hidden"
              title="Foto aufnehmen"
            >
              <Camera size={12} />
              Foto
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              data-testid="attachment-upload-btn"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              Datei
            </button>
            {/* Hidden inputs: one for camera (mobile, env-facing camera),
                one for generic file picker. */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              data-testid="attachment-file-input"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={16} className="animate-spin text-slate-400" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-3">Keine Anhänge.</div>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => {
            const Icon = isImage(a.contentType) ? ImageIcon : FileIcon;
            return (
              <li
                key={a.id}
                className="rounded-lg border border-slate-200 px-3 py-2 flex items-center gap-2 text-sm hover:border-slate-300 transition"
                data-testid="attachment-row"
              >
                <Icon size={14} className="text-slate-400 flex-shrink-0" />
                <button
                  type="button"
                  onClick={() => handleOpen(a)}
                  className="text-left flex-1 truncate text-slate-700 hover:text-slate-900"
                  title={a.filename}
                >
                  {a.filename}
                </button>
                {a.sizeBytes != null && (
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    {humanSize(a.sizeBytes)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleOpen(a)}
                  className="rounded p-1 text-slate-400 hover:text-slate-700"
                  aria-label="Öffnen"
                >
                  <Download size={12} />
                </button>
                {editable && (
                  <button
                    type="button"
                    onClick={() => handleDelete(a)}
                    className="rounded p-1 text-slate-400 hover:text-red-600 hover:bg-red-50"
                    aria-label="Entfernen"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
