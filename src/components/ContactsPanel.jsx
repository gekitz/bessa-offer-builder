import { useState } from 'react';
import { Loader2, Mail, Phone, Download, RefreshCw, Plus, X, Pencil } from 'lucide-react';
import { fetchContacts, contactDisplayName, createContact, updateContact } from '../lib/mesonicContacts';

const EMPTY_FORM = { vorname: '', name: '', email: '', mobil: '', abteilung: '' };

// Ansprechpartner eines Kontos (Mesonic Type 7, WEBKontakt). Anzeige auf Abruf —
// ein Export-Call liefert alle Kontakte des Kunden (wenige), daher ohne
// Cache/Pagination. Neue Ansprechpartner werden über dieselbe Vorlage (Type 7)
// nach Mesonic geschrieben, bestehende über ihre Kontaktnummer aktualisiert.
// Keyed by Kontonummer, überall wiederverwendbar.
export default function ContactsPanel({ kdnr }) {
  const [contacts, setContacts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // Contact | null (null = Neuanlage)
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setContacts(await fetchContacts(kdnr));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
    setShowForm(true);
  }

  function openEdit(c) {
    setEditing(c);
    setForm({ vorname: c.vorname, name: c.name, email: c.email, mobil: c.mobil, abteilung: c.abteilung });
    setSaveError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setSaveError(null);
  }

  function updateFormField(patch) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = editing ? await updateContact(editing, form) : await createContact(kdnr, form);
      if (res && res.success === false) {
        setSaveError(res.error || 'Speichern fehlgeschlagen.');
        return;
      }
      closeForm();
      await load(); // frisch geladene Liste zeigt die Änderung
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Name (Nachname) ist im WEBKontakt-XSD Pflichtfeld.
  const canSave = !saving && form.name.trim();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ansprechpartner</span>
        <div className="flex items-center gap-3">
          {contacts !== null && !loading && (
            <button onClick={load} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <RefreshCw className="w-3.5 h-3.5" /> Aktualisieren
            </button>
          )}
          <button
            onClick={() => (showForm ? closeForm() : openCreate())}
            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
          >
            {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showForm ? 'Abbrechen' : 'Neuer Ansprechpartner'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="text-xs font-medium text-slate-500">
            {editing ? `Ansprechpartner bearbeiten · ${editing.kontaktnummer}` : 'Neuer Ansprechpartner'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="Vorname"
              value={form.vorname}
              onChange={(e) => updateFormField({ vorname: e.target.value })}
              className="w-full min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
            <input
              placeholder="Nachname *"
              value={form.name}
              onChange={(e) => updateFormField({ name: e.target.value })}
              className="w-full min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
            <input
              type="email"
              placeholder="E-Mail"
              value={form.email}
              onChange={(e) => updateFormField({ email: e.target.value })}
              className="w-full min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
            <input
              type="tel"
              placeholder="Mobil"
              value={form.mobil}
              onChange={(e) => updateFormField({ mobil: e.target.value })}
              className="w-full min-w-0 border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            />
          </div>
          <input
            placeholder="Abteilung"
            value={form.abteilung}
            onChange={(e) => updateFormField({ abteilung: e.target.value })}
            className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
          {saveError && <p className="text-xs text-rose-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="px-3 py-1.5 text-xs rounded-lg text-slate-500 hover:bg-slate-200">
              Abbrechen
            </button>
            <button
              onClick={save}
              disabled={!canSave}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg ${
                canSave ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Speichern
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin inline" /></div>
      ) : error ? (
        <p className="text-xs text-rose-600">{error}</p>
      ) : contacts === null ? (
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <Download className="w-3.5 h-3.5" /> Ansprechpartner laden
        </button>
      ) : contacts.length === 0 ? (
        <p className="text-xs text-slate-400">Keine Ansprechpartner in Mesonic.</p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c, i) => (
            <li key={i} className="group relative rounded-lg border border-slate-200 px-3 py-2">
              {c.kontaktnummer && (
                <button
                  onClick={() => openEdit(c)}
                  title="Bearbeiten"
                  className="absolute right-2 top-2 text-slate-300 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="text-sm font-medium text-slate-800 pr-6">
                {contactDisplayName(c)}
                {c.abteilung && <span className="ml-1 font-normal text-slate-400">· {c.abteilung}</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-red-600 hover:underline">
                    <Mail className="w-3 h-3" /> {c.email}
                  </a>
                )}
                {c.mobil && (
                  <a href={`tel:${c.mobil.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 text-slate-600 hover:underline">
                    <Phone className="w-3 h-3" /> {c.mobil}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
