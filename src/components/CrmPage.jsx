import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, Loader2, ArrowLeft, Building2, Phone, Mail, MapPin, User, FileText, ChevronRight, AlertCircle, RefreshCw, Plus, Pen, Save, CheckCircle2 } from 'lucide-react';
import { searchCustomers, getCustomer, listCustomers, getCustomerContacts, saveCustomer, validateCustomer, TYPES, TEMPLATES, mesonicExport } from '../lib/mesonicApi';
import CustomerForm from './CustomerForm';

// ═══════════════════════════════════════════════════════
// CRM Page — Customer Search & Detail
// ═══════════════════════════════════════════════════════

// ─── Debounce hook ───
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Field accessor ───
// Mesonic templates return human-readable German field names.
// This helper tries multiple possible names for each concept.
function f(record, ...keys) {
  for (const k of keys) {
    if (record[k] && record[k].trim()) return record[k].trim();
  }
  return '';
}

// Shorthand accessors for common fields
const F = {
  name:    (r) => f(r, 'Name', 'Firmenname', 'T055_C003', 'T055.C003'),
  name2:   (r) => f(r, 'Name2', 'Name 2', 'T055_C004', 'T055.C004'),
  street:  (r) => f(r, 'Strasse', 'Straße', 'Straẞe', 'T055_C007', 'T055.C007'),
  zip:     (r) => f(r, 'Postleitzahl', 'PLZ', 'T055_C008', 'T055.C008'),
  city:    (r) => f(r, 'Ort', 'Stadt', 'T055_C009', 'T055.C009'),
  country: (r) => f(r, 'Land', 'T055_C010', 'T055.C010'),
  phone:   (r) => f(r, 'Telefon', 'Tel', 'T055_C011', 'T055.C011'),
  fax:     (r) => f(r, 'Fax', 'T055_C012', 'T055.C012'),
  email:   (r) => f(r, 'Email', 'E-Mail', 'EMail', 'T055_C013', 'T055.C013'),
  uid:     (r) => f(r, 'UID', 'UID-Nr.', 'UIDNr', 'T055_C016', 'T055.C016'),
  number:  (r) => f(r, 'Kontonummer', 'Kundennummer', 'KontoNr', 'T055_C023', 'T055.C023'),
  group:   (r) => f(r, 'Kontogruppe', 'T055_C024', 'T055.C024'),
  web:     (r) => f(r, 'Homepage', 'Website', 'Web', 'T055_C038', 'T055.C038'),
  salut:   (r) => f(r, 'Anrede', 'T055_C039', 'T055.C039'),
  contact: (r) => f(r, 'Ansprechpartner', 'Kontakt', 'T055_C061', 'T055.C061'),
  mobile:  (r) => f(r, 'Mobiltelefon', 'Mobil', 'Handy', 'T055_C082', 'T055.C082'),
};

// ─── Field display helpers ───
const IMPORTANT_KEYS = new Set([
  'Name', 'Firmenname', 'T055_C003',
  'Strasse', 'Straße', 'T055_C007',
  'Postleitzahl', 'PLZ', 'T055_C008',
  'Ort', 'T055_C009',
  'Land', 'T055_C010',
  'Telefon', 'T055_C011',
  'Email', 'E-Mail', 'T055_C013',
  'Kontonummer', 'Kundennummer', 'T055_C023',
  'UID', 'UID-Nr.', 'T055_C016',
  'Mobiltelefon', 'T055_C082',
  'Homepage', 'T055_C038',
  'Ansprechpartner', 'T055_C061',
  'Anrede', 'T055_C039',
  'Fax', 'T055_C012',
]);

function isImportantField(key) {
  return IMPORTANT_KEYS.has(key);
}

// ─── Customer Card (list item) ───
function CustomerCard({ record, onClick }) {
  const name = F.name(record) || 'Unbekannt';
  const street = F.street(record);
  const zip = F.zip(record);
  const city = F.city(record);
  const phone = F.phone(record);
  const email = F.email(record);
  const number = F.number(record);
  const address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-red-300 hover:shadow-md transition-all group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Building2 size={16} className="text-slate-400" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 truncate" style={{ fontSize: 14 }}>{name}</div>
              {number && <div className="text-slate-400" style={{ fontSize: 11 }}>Nr. {number}</div>}
            </div>
          </div>
          {address && (
            <div className="flex items-center gap-1.5 mt-2 text-slate-500" style={{ fontSize: 12 }}>
              <MapPin size={12} className="flex-shrink-0" />
              <span className="truncate">{address}</span>
            </div>
          )}
          <div className="flex items-center gap-4 mt-1.5">
            {phone && (
              <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: 12 }}>
                <Phone size={11} className="flex-shrink-0" />
                <span>{phone}</span>
              </div>
            )}
            {email && (
              <div className="flex items-center gap-1.5 text-slate-500" style={{ fontSize: 12 }}>
                <Mail size={11} className="flex-shrink-0" />
                <span className="truncate">{email}</span>
              </div>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-slate-300 group-hover:text-red-400 flex-shrink-0 mt-2 transition-colors" />
      </div>
    </button>
  );
}

// ─── Customer Detail View ───
function CustomerDetail({ record, onBack, onEdit }) {
  const name = F.name(record) || 'Unbekannt';
  const number = F.number(record);
  const phone = F.phone(record);
  const email = F.email(record);
  const web = F.web(record);

  // Split fields into important (top) and other (expandable)
  const importantFields = [];
  const otherFields = [];

  Object.entries(record).forEach(([key, value]) => {
    if (!value || value.trim() === '') return;
    if (isImportantField(key)) {
      importantFields.push({ key, label: key, value });
    } else {
      otherFields.push({ key, label: key, value });
    }
  });

  const [showAll, setShowAll] = useState(false);

  return (
    <div>
      {/* Back button + header */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-slate-500 hover:text-red-600 transition-colors mb-4" style={{ fontSize: 13 }}>
        <ArrowLeft size={16} />
        <span>Zurück zur Liste</span>
      </button>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-100" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                <Building2 size={22} className="text-red-500" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800" style={{ fontSize: 18 }}>{name}</h2>
                {number && <div className="text-slate-400" style={{ fontSize: 12 }}>Kundennummer: {number}</div>}
              </div>
            </div>
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-600 px-3 py-2 hover:bg-slate-200 transition-colors"
                style={{ fontSize: 13 }}
              >
                <Pen size={14} />
                Bearbeiten
              </button>
            )}
          </div>
        </div>

        {/* Quick contact actions */}
        <div className="flex border-b border-slate-100">
          {phone && (
            <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors" style={{ fontSize: 13 }}>
              <Phone size={15} /> Anrufen
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors border-l border-slate-100" style={{ fontSize: 13 }}>
              <Mail size={15} /> E-Mail
            </a>
          )}
          {web && (
            <a href={web.startsWith('http') ? web : `https://${web}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors border-l border-slate-100" style={{ fontSize: 13 }}>
              <FileText size={15} /> Website
            </a>
          )}
        </div>

        {/* Important fields */}
        <div className="p-4">
          <h3 className="font-semibold text-slate-600 mb-3" style={{ fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Stammdaten</h3>
          <div className="space-y-2.5">
            {importantFields.map(f => (
              <div key={f.key} className="flex items-start gap-3">
                <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 12, width: 120, paddingTop: 1 }}>{f.label}</span>
                <span className="text-slate-800 font-medium" style={{ fontSize: 13 }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Other fields (collapsible) */}
        {otherFields.length > 0 && (
          <div className="border-t border-slate-100">
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full px-4 py-3 text-left flex items-center justify-between text-slate-500 hover:text-slate-700 transition-colors"
              style={{ fontSize: 12 }}
            >
              <span>{showAll ? 'Weniger anzeigen' : `Alle Felder anzeigen (${otherFields.length} weitere)`}</span>
              <ChevronRight size={14} className={`transition-transform ${showAll ? 'rotate-90' : ''}`} />
            </button>
            {showAll && (
              <div className="px-4 pb-4 space-y-2">
                {otherFields.map(f => (
                  <div key={f.key} className="flex items-start gap-3">
                    <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 11, width: 140, paddingTop: 1, fontFamily: 'monospace' }}>{f.key}</span>
                    <span className="text-slate-600" style={{ fontSize: 12 }}>{f.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main CRM Page ───
export default function CrmPage() {
  // view: 'search' | 'detail' | 'create' | 'edit'
  const [view, setView] = useState('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null); // null = no search yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const inputRef = useRef(null);

  const debouncedQuery = useDebounce(query, 400);

  // Search when debounced query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    searchCustomers(debouncedQuery)
      .then(data => {
        if (cancelled) return;
        setResults(data.records || []);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message);
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  function handleSelectCustomer(record) {
    setSelectedCustomer(record);
    setView('detail');
  }

  function handleBackToSearch() {
    setSelectedCustomer(null);
    setView('search');
  }

  function handleCreateNew() {
    setView('create');
  }

  function handleEditCustomer() {
    // selectedCustomer is already set from detail view
    setView('edit');
  }

  function handleFormSaved(result) {
    // After save, go back to search so user can find the new/updated customer
    setSelectedCustomer(null);
    setView('search');
  }

  function handleFormCancel() {
    // If we came from edit, go back to detail; from create, go back to search
    if (view === 'edit' && selectedCustomer) {
      setView('detail');
    } else {
      setView('search');
    }
  }

  // ── Create view ──
  if (view === 'create') {
    return (
      <div className="max-w-2xl mx-auto">
        <CustomerForm
          onSaved={handleFormSaved}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // ── Edit view ──
  if (view === 'edit' && selectedCustomer) {
    return (
      <div className="max-w-2xl mx-auto">
        <CustomerForm
          initialData={selectedCustomer}
          onSaved={handleFormSaved}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // ── Detail view ──
  if (view === 'detail' && selectedCustomer) {
    return (
      <div className="max-w-2xl mx-auto">
        <CustomerDetail
          record={selectedCustomer}
          onBack={handleBackToSearch}
          onEdit={handleEditCustomer}
        />
      </div>
    );
  }

  // ── Search + List view ──
  return (
    <div className="max-w-2xl mx-auto">
      {/* Search bar + New customer button */}
      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Kunde suchen (Name, Ort, Nummer...)"
            className="w-full rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 pl-11 pr-10 py-3 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 shadow-sm"
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors"
            >
              <X size={18} />
            </button>
          )}
          {loading && (
            <Loader2 size={18} className="absolute right-10 top-1/2 -translate-y-1/2 text-red-400 animate-spin" />
          )}
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-1.5 rounded-xl bg-red-600 text-white px-4 py-3 hover:bg-red-700 transition-colors shadow-sm whitespace-nowrap"
          style={{ fontSize: 13 }}
        >
          <Plus size={16} />
          Neuer Kunde
        </button>
      </div>

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 text-red-600 border border-red-200" style={{ fontSize: 13 }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Results */}
      {results === null && !loading && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <Search size={28} className="text-slate-300" />
          </div>
          <div className="text-slate-400" style={{ fontSize: 14 }}>Suche nach Kundenname, Ort oder Kundennummer</div>
          <div className="text-slate-300 mt-1" style={{ fontSize: 12 }}>Mindestens 2 Zeichen eingeben</div>
        </div>
      )}

      {results !== null && results.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <Building2 size={24} className="text-slate-300" />
          </div>
          <div className="text-slate-400" style={{ fontSize: 14 }}>Kein Kunde gefunden</div>
          <div className="text-slate-300 mt-1" style={{ fontSize: 12 }}>Versuche einen anderen Suchbegriff</div>
        </div>
      )}

      {results && results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-400" style={{ fontSize: 12 }}>{results.length} Ergebnis{results.length !== 1 ? 'se' : ''}</span>
          </div>
          <div className="space-y-2">
            {results.map((record, idx) => (
              <CustomerCard
                key={record.T055_C023 || idx}
                record={record}
                onClick={() => handleSelectCustomer(record)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
