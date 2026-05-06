import { useEffect, useMemo, useState } from 'react';
import { Loader2, Mail, Paperclip, Link2, Send, X } from 'lucide-react';

import {
  FOLLOWUP_TEMPLATES,
  type FollowupTemplateId,
  type TemplateOfferShape,
  getTemplate,
  suggestTemplate,
} from '../../data/followupTemplates';

// Compose + send a follow-up email on an existing offer. The modal
// pre-fills the suggested template based on time-since-send and
// recent opens, but every field is editable so the rep can tweak the
// last line before sending. Sending is final — there's no draft state.

export interface SendFollowupDraft {
  templateId: FollowupTemplateId;
  subject: string;
  body: string;
  attachPdf: boolean;
  includeAcceptLink: boolean;
}

export interface SendFollowupModalProps {
  offer: TemplateOfferShape;
  // Recent open count over the lookback window (typically 7d). Used
  // to bias the auto-suggested template toward soft_nudge when the
  // customer has already engaged.
  recentOpens?: number;
  // The offer has a share_code already, meaning the accept-link
  // option is genuinely useful. When false we still show the toggle
  // but default it off and disable it.
  acceptLinkAvailable?: boolean;
  // The offer has a stored PDF that can be re-attached. When false
  // we hide the PDF toggle (nothing to attach).
  pdfAvailable?: boolean;
  onSubmit: (draft: SendFollowupDraft) => Promise<void> | void;
  onClose: () => void;
  saving?: boolean;
}

export default function SendFollowupModal({
  offer,
  recentOpens = 0,
  acceptLinkAvailable = false,
  pdfAvailable = true,
  onSubmit,
  onClose,
  saving = false,
}: SendFollowupModalProps) {
  // The initial suggestion only runs once per modal open. After that
  // the rep is in control — switching templates is an explicit click,
  // and we deliberately overwrite their edits when they do.
  const initialId = useMemo(
    () => suggestTemplate(offer, { recentOpens }),
    // Intentionally stable — we don't want re-suggests mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [templateId, setTemplateId] = useState<FollowupTemplateId>(initialId);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachPdf, setAttachPdf] = useState<boolean>(pdfAvailable);
  const [includeAcceptLink, setIncludeAcceptLink] = useState<boolean>(acceptLinkAvailable);

  // Whenever the user switches template, regenerate subject + body.
  // This intentionally clobbers manual edits — switching templates
  // is the rep saying "start fresh from this angle".
  useEffect(() => {
    const t = getTemplate(templateId);
    const rendered = t.render(offer, { recentOpens });
    setSubject(rendered.subject);
    setBody(rendered.body);
  }, [templateId, offer, recentOpens]);

  // Esc closes the modal (unless saving)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const customerLabel = offer.customer_company || offer.customer_name || 'Kunde';

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && !saving;

  function handleSubmit() {
    if (!canSend) return;
    onSubmit({
      templateId,
      subject: subject.trim(),
      body,
      attachPdf,
      includeAcceptLink,
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-0 md:p-4" onClick={() => !saving && onClose()}>
      <div
        className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200">
          <div className="rounded-lg bg-blue-50 text-blue-600 p-2">
            <Mail size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 14 }}>
              Folgemail an {customerLabel}
            </div>
            <div className="text-slate-500 truncate" style={{ fontSize: 12 }}>
              {offer.customer_name && offer.customer_company ? `${offer.customer_name} · ` : ''}
              wird threaded in das Original-Angebot
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 transition-colors disabled:opacity-50"
            aria-label="Schließen"
          >
            <X size={16} />
          </button>
        </div>

        {/* Briefing — internal context the rep wrote when the offer
            was created. Read-only here; the rep paraphrases into the
            body if relevant. Hidden when no briefing was set. */}
        {offer.briefing && (
          <div className="px-5 py-3 border-b border-slate-200 bg-amber-50/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-amber-900" style={{ fontSize: 11 }}>Briefing</span>
              <span className="text-amber-700 bg-amber-200/60 rounded-full px-1.5 py-0.5 font-medium" style={{ fontSize: 9 }}>intern</span>
            </div>
            <p className="text-amber-900 whitespace-pre-wrap" style={{ fontSize: 12, lineHeight: 1.5 }}>{offer.briefing}</p>
          </div>
        )}

        {/* Template chips */}
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/50">
          <div className="text-slate-500 mb-1.5" style={{ fontSize: 11 }}>Vorlage</div>
          <div className="flex flex-wrap gap-1.5">
            {FOLLOWUP_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplateId(t.id)}
                disabled={saving}
                className={`rounded-full px-3 py-1.5 font-medium border transition-colors ${
                  templateId === t.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                } disabled:opacity-50`}
                style={{ fontSize: 11 }}
                title={t.description}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div>
            <label htmlFor="followup-subject" className="block text-slate-600 mb-1" style={{ fontSize: 11 }}>Betreff</label>
            <input
              id="followup-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 disabled:bg-slate-50"
              style={{ fontSize: 13 }}
            />
          </div>

          <div>
            <label htmlFor="followup-body" className="block text-slate-600 mb-1" style={{ fontSize: 11 }}>Nachricht</label>
            <textarea
              id="followup-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={saving}
              rows={12}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 font-mono disabled:bg-slate-50"
              style={{ fontSize: 12, lineHeight: 1.6 }}
            />
            <div className="text-slate-400 mt-1" style={{ fontSize: 10 }}>
              Leerzeile = neuer Absatz. Einzelne Zeilenumbrüche bleiben erhalten.
            </div>
          </div>

          {/* Attachments / options */}
          <div className="flex flex-wrap gap-2">
            {pdfAvailable && (
              <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                attachPdf ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}>
                <input
                  type="checkbox"
                  checked={attachPdf}
                  onChange={(e) => setAttachPdf(e.target.checked)}
                  disabled={saving}
                  className="sr-only"
                />
                <Paperclip size={12} />
                <span style={{ fontSize: 12 }}>PDF anhängen</span>
              </label>
            )}
            <label className={`flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
              !acceptLinkAvailable ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed' :
                includeAcceptLink ? 'bg-blue-50 border-blue-200 text-blue-700 cursor-pointer' :
                'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer'
            }`}>
              <input
                type="checkbox"
                checked={includeAcceptLink}
                onChange={(e) => setIncludeAcceptLink(e.target.checked)}
                disabled={saving || !acceptLinkAvailable}
                className="sr-only"
              />
              <Link2 size={12} />
              <span style={{ fontSize: 12 }}>Annahme-Link einbinden</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50/50">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white text-slate-600 px-3 py-2 hover:bg-slate-50 transition-colors disabled:opacity-50"
            style={{ fontSize: 12 }}
          >
            Abbrechen
          </button>
          <div className="flex-1" />
          <button
            onClick={handleSubmit}
            disabled={!canSend}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontSize: 12 }}
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            {saving ? 'Wird gesendet...' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  );
}
