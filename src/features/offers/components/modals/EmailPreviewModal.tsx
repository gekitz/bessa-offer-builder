import { useState } from 'react';
import { FileText, Loader2, Mail, Send, X } from 'lucide-react';
import { fmt } from '../../../../lib/format';
import type { OfferTotals } from '../../../../lib/totals';

export interface EmailText {
  subject: string;
  greeting: string;
  body: string;
  closing: string;
}

interface Customer {
  name?: string;
  company?: string;
  email?: string;
}

interface Creator {
  name?: string;
}

interface EmailPreviewModalProps {
  customer: Customer;
  creator: Creator | null | undefined;
  totals: OfferTotals;
  onSend: (text: EmailText) => void;
  onClose: () => void;
  sending: boolean;
}

export default function EmailPreviewModal({ customer, creator, totals, onSend, onClose, sending }: EmailPreviewModalProps) {
  const customerName = customer.name || customer.company || 'Kunde';
  const creatorName = creator?.name || 'Kitz Team';
  const companyName = customer.company || customer.name || 'Angebot';

  const [subject, setSubject] = useState(`Ihr Angebot von Kitz Computer & Office GmbH – ${companyName}`);
  const [greeting, setGreeting] = useState(`Sehr geehrte/r ${customerName},`);
  const [body, setBody] = useState('vielen Dank für Ihr Interesse. Anbei erhalten Sie Ihr persönliches Angebot als PDF-Anhang.');
  const [closing, setClosing] = useState('Bei Fragen stehe ich Ihnen jederzeit gerne zur Verfügung.');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-blue-600 text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={18} />
            <span className="font-bold" style={{ fontSize: 16 }}>E-Mail Vorschau</span>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* To */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-400 font-medium w-12">An:</span>
            <span className="text-slate-700 font-medium">{customer.email}</span>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Betreff</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>

          {/* Email preview */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Header preview */}
            <div className="bg-slate-700 px-6 py-4 text-center">
              <div className="inline-block bg-white text-red-600 font-bold px-3 py-1.5 rounded-lg" style={{fontSize:14}}>KITZ</div>
              <div className="text-white text-xs mt-1">Computer & Office GmbH</div>
            </div>

            <div className="p-5 space-y-3">
              {/* Greeting */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Anrede</label>
                <input value={greeting} onChange={e => setGreeting(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nachricht</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              {/* Summary box (non-editable) */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="font-bold text-slate-700 text-xs mb-2">Zusammenfassung</div>
                {totals.monthly > 0 && (
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Monatliche Kosten (netto)</span>
                    <span className="font-semibold text-slate-800">€ {fmt(totals.monthly)}/Mo</span>
                  </div>
                )}
                {totals.once > 0 && (
                  <div className="flex justify-between text-xs text-slate-600 mt-1">
                    <span>Einmalige Kosten (netto)</span>
                    <span className="font-semibold text-slate-800">€ {fmt(totals.once)}</span>
                  </div>
                )}
              </div>

              {/* Closing */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Abschluss</label>
                <input value={closing} onChange={e => setClosing(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
              </div>

              <div className="text-sm text-slate-600">Mit freundlichen Grüßen</div>

              {/* Signature (non-editable) */}
              <div className="border-t border-slate-200 pt-3">
                <div className="font-bold text-slate-700 text-sm">{creatorName}</div>
                <div className="text-slate-400 text-xs">Kitz Computer & Office GmbH</div>
                <div className="text-slate-400 text-xs">www.kitz.co.at</div>
              </div>
            </div>

            {/* Footer preview */}
            <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 text-center">
              <div className="text-slate-400" style={{fontSize:10}}>
                Kitz Computer & Office GmbH | Johann-Offner-Str. 17, 9400 Wolfsberg | Rosentalerstr. 1, 9020 Klagenfurt
              </div>
            </div>
          </div>

          {/* PDF attachment indicator */}
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
            <FileText size={14} className="text-red-500" />
            <span className="text-xs text-slate-600 font-medium">PDF-Angebot wird angehängt</span>
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-200 p-4 flex gap-2 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 rounded-xl bg-slate-100 text-slate-700 font-semibold py-3 hover:bg-slate-200 active:scale-[0.98] transition-all"
            style={{fontSize:14}}>
            Abbrechen
          </button>
          <button onClick={() => onSend({ subject, greeting, body, closing })} disabled={sending}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white font-semibold py-3 hover:bg-blue-700 active:scale-[0.98] transition-all shadow-lg shadow-blue-200 ${sending ? 'opacity-70 cursor-wait' : ''}`}
            style={{fontSize:14}}>
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            {sending ? 'Senden...' : 'Jetzt senden'}
          </button>
        </div>
      </div>
    </div>
  );
}
