import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, Building2, Phone, Mail, MapPin, ChevronRight, AlertCircle } from 'lucide-react';
import { searchCustomers } from '../lib/mesonicApi';

// ═══════════════════════════════════════════════════════
// Customer Picker — Modal to search & select a Mesonic customer
// ═══════════════════════════════════════════════════════

// ─── Field accessor (same as CrmPage) ───
function f(record, ...keys) {
  for (const k of keys) {
    if (record[k] && record[k].trim()) return record[k].trim();
  }
  return '';
}

const F = {
  name:   (r) => f(r, 'Name', 'Firmenname', 'T055_C003', 'T055.C003'),
  name2:  (r) => f(r, 'Name2', 'Name 2', 'T055_C004', 'T055.C004'),
  street: (r) => f(r, 'Strasse', 'Straße', 'T055_C007', 'T055.C007'),
  zip:    (r) => f(r, 'Postleitzahl', 'PLZ', 'T055_C008', 'T055.C008'),
  city:   (r) => f(r, 'Ort', 'Stadt', 'T055_C009', 'T055.C009'),
  phone:  (r) => f(r, 'Telefon', 'Tel', 'T055_C011', 'T055.C011'),
  email:  (r) => f(r, 'Email', 'E-Mail', 'EMail', 'T055_C013', 'T055.C013'),
  number: (r) => f(r, 'Kontonummer', 'Kundennummer', 'KontoNr', 'T055_C023', 'T055.C023'),
  contact:(r) => f(r, 'Ansprechpartner', 'Kontakt', 'T055_C061', 'T055.C061'),
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function CustomerPicker({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const debouncedQuery = useDebounce(query, 400);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
        if (!cancelled) setResults(data.records || []);
      })
      .catch(err => {
        if (!cancelled) { setError(err.message); setResults([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [debouncedQuery]);

  function handleSelect(record) {
    const name = F.name(record);
    const contact = F.contact(record);
    const street = F.street(record);
    const zip = F.zip(record);
    const city = F.city(record);
    const address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

    onSelect({
      company: name,
      name: contact,
      email: F.email(record),
      phone: F.phone(record),
      address,
      mesonicId: F.number(record),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl mt-16 w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-slate-800" style={{ fontSize: 15 }}>Bestandskunde suchen</span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Name, Ort oder Kundennummer..."
              className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            />
            {loading && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-red-400 animate-spin" />}
            {!loading && query && (
              <button onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto px-3 py-2">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 border border-red-200 m-2" style={{ fontSize: 12 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          {results === null && !loading && (
            <div className="text-center py-10 text-slate-400" style={{ fontSize: 13 }}>
              Kundennamen oder Ort eingeben (min. 2 Zeichen)
            </div>
          )}

          {results && results.length === 0 && !loading && (
            <div className="text-center py-10 text-slate-400" style={{ fontSize: 13 }}>
              Kein Kunde gefunden
            </div>
          )}

          {results && results.length > 0 && (
            <div className="space-y-1">
              {results.map((record, idx) => {
                const name = F.name(record) || 'Unbekannt';
                const number = F.number(record);
                const street = F.street(record);
                const zip = F.zip(record);
                const city = F.city(record);
                const phone = F.phone(record);
                const address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

                return (
                  <button
                    key={number || idx}
                    onClick={() => handleSelect(record)}
                    className="w-full text-left rounded-lg p-3 hover:bg-red-50 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                          <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 13 }}>{name}</span>
                          {number && <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 10 }}>#{number}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 ml-5">
                          {address && (
                            <span className="text-slate-500 truncate" style={{ fontSize: 11 }}>
                              <MapPin size={10} className="inline mr-0.5" />{address}
                            </span>
                          )}
                          {phone && (
                            <span className="text-slate-500 flex-shrink-0" style={{ fontSize: 11 }}>
                              <Phone size={10} className="inline mr-0.5" />{phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-red-400 flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
