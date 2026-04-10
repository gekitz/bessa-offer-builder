import { useState } from 'react';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { saveCustomer, validateCustomer } from '../lib/mesonicApi';

// ═══════════════════════════════════════════════════════
// Customer Form — Create or edit a Mesonic customer
// ═══════════════════════════════════════════════════════

// The fields we show in the form. These must match the Mesonic template field names.
// We use the German names as seen in WebKontenExport responses.
const FORM_FIELDS = [
  { key: 'Name', label: 'Firmenname', required: true, placeholder: 'z.B. KITZ Computer + Office GmbH', colSpan: 2 },
  { key: 'Anrede', label: 'Anrede', placeholder: 'z.B. Firma, Herr, Frau' },
  { key: 'Ansprechpartner', label: 'Ansprechpartner', placeholder: 'Vor- und Nachname' },
  { key: 'Strasse', label: 'Straße', placeholder: 'Straße und Hausnummer', colSpan: 2 },
  { key: 'Postleitzahl', label: 'PLZ', placeholder: 'z.B. 9020' },
  { key: 'Ort', label: 'Ort', required: true, placeholder: 'z.B. Klagenfurt' },
  { key: 'Land', label: 'Land', placeholder: 'z.B. Österreich' },
  { key: 'Telefon', label: 'Telefon', placeholder: '+43 ...' },
  { key: 'Email', label: 'E-Mail', placeholder: 'name@firma.at', type: 'email' },
  { key: 'Fax', label: 'Fax', placeholder: '+43 ...' },
  { key: 'Mobiltelefon', label: 'Mobiltelefon', placeholder: '+43 ...' },
  { key: 'Homepage', label: 'Homepage', placeholder: 'www.firma.at' },
  { key: 'UID', label: 'UID-Nr.', placeholder: 'ATU12345678' },
];

export default function CustomerForm({ initialData, onSaved, onCancel }) {
  const isEdit = !!initialData;

  // Initialize form state from initialData (edit) or empty (create)
  const [fields, setFields] = useState(() => {
    const initial = {};
    FORM_FIELDS.forEach(f => {
      initial[f.key] = (initialData && initialData[f.key]) || '';
    });
    // For edit, also keep the Kontonummer
    if (initialData?.Kontonummer) initial.Kontonummer = initialData.Kontonummer;
    return initial;
  });

  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function updateField(key, value) {
    setFields(f => ({ ...f, [key]: value }));
    setError(null);
    setSuccess(false);
  }

  async function handleValidate() {
    setValidating(true);
    setError(null);
    try {
      const result = await validateCustomer(fields);
      if (!result.success) {
        setError(`Validierung fehlgeschlagen: ${result.error}`);
      } else {
        setError(null);
        alert('Validierung erfolgreich — Daten sind korrekt.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  }

  async function handleSave() {
    // Basic client-side validation
    const missing = FORM_FIELDS
      .filter(f => f.required && !fields[f.key]?.trim())
      .map(f => f.label);

    if (missing.length > 0) {
      setError(`Pflichtfelder fehlen: ${missing.join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await saveCustomer(fields);
      console.log('[CustomerForm] save result:', result);
      if (!result.success) {
        setError(`Mesonic-Fehler: ${result.error || 'Unbekannter Fehler'}`);
      } else {
        // Show success screen first — user can navigate back manually
        setSuccess(true);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h2 className="font-bold text-slate-800 mb-2" style={{ fontSize: 18 }}>
            {isEdit ? 'Kunde aktualisiert' : 'Kunde angelegt'}
          </h2>
          <p className="text-slate-500 mb-6" style={{ fontSize: 13 }}>
            {fields.Name} wurde erfolgreich {isEdit ? 'in Mesonic aktualisiert' : 'in Mesonic angelegt'}.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => { if (onSaved) onSaved(); else onCancel(); }}
              className="rounded-lg bg-slate-100 text-slate-600 px-4 py-2 hover:bg-slate-200 transition-colors"
              style={{ fontSize: 13 }}
            >
              Zurück zur Suche
            </button>
            <button
              onClick={() => { setSuccess(false); setFields({}); FORM_FIELDS.forEach(f => setFields(prev => ({...prev, [f.key]: ''}))); }}
              className="rounded-lg bg-red-600 text-white px-4 py-2 hover:bg-red-700 transition-colors"
              style={{ fontSize: 13 }}
            >
              Weiteren Kunden anlegen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back button */}
      <button onClick={onCancel} className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 transition-colors mb-4" style={{ fontSize: 13 }}>
        <ArrowLeft size={16} />
        <span>Zurück</span>
      </button>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
              <Building2 size={22} className="text-red-500" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800" style={{ fontSize: 18 }}>
                {isEdit ? 'Kunde bearbeiten' : 'Neuer Kunde'}
              </h2>
              <div className="text-slate-400" style={{ fontSize: 12 }}>
                {isEdit ? `Kundennummer: ${fields.Kontonummer || '—'}` : 'Wird in Mesonic WinLine angelegt'}
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            {FORM_FIELDS.map(field => (
              <div key={field.key} className={field.colSpan === 2 ? 'col-span-2' : ''}>
                <label className="block text-slate-500 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>
                  {field.label}
                  {field.required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input
                  type={field.type || 'text'}
                  value={fields[field.key] || ''}
                  onChange={e => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                />
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-red-50 text-red-600 border border-red-200" style={{ fontSize: 12 }}>
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-slate-100">
            <button
              onClick={onCancel}
              className="rounded-lg bg-slate-100 text-slate-600 px-4 py-2 hover:bg-slate-200 transition-colors"
              style={{ fontSize: 13 }}
            >
              Abbrechen
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-red-600 text-white px-5 py-2 hover:bg-red-700 transition-colors disabled:opacity-50"
              style={{ fontSize: 13 }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isEdit ? 'Speichern' : 'Kunde anlegen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
