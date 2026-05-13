// Left column of the dispatcher view.
//
// Single search input → debounced Mesonic search → list of customer
// cards. The dispatcher picks a customer with one click; the picked
// customer flows up to the page state.
//
// The accessor helpers mirror CustomerPicker.jsx / CrmPage.jsx — the
// Mesonic API returns either German labels ("Name") or column codes
// ("T055_C003") depending on the template, and we have to cope with
// both.

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Building2, ChevronRight, Loader2, MapPin, Phone, Search, X } from 'lucide-react';
import { searchCustomers } from '../../../lib/mesonicApi';

export interface DispatcherCustomer {
  company: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  mesonicId: string;
}

interface Props {
  onPick: (customer: DispatcherCustomer) => void;
  selectedMesonicId?: string;
}

function f(record: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    if (record[k] && record[k].trim()) return record[k].trim();
  }
  return '';
}

const F = {
  name: (r: Record<string, string>) => f(r, 'Name', 'Firmenname', 'T055_C003', 'T055.C003'),
  street: (r: Record<string, string>) => f(r, 'Strasse', 'Straße', 'T055_C007', 'T055.C007'),
  zip: (r: Record<string, string>) => f(r, 'Postleitzahl', 'PLZ', 'T055_C008', 'T055.C008'),
  city: (r: Record<string, string>) => f(r, 'Ort', 'Stadt', 'T055_C009', 'T055.C009'),
  phone: (r: Record<string, string>) => f(r, 'Telefon', 'Tel', 'T055_C011', 'T055.C011'),
  email: (r: Record<string, string>) => f(r, 'Email', 'E-Mail', 'EMail', 'T055_C013', 'T055.C013'),
  number: (r: Record<string, string>) => f(r, 'Kontonummer', 'Kundennummer', 'KontoNr', 'T055_C023', 'T055.C023'),
  contact: (r: Record<string, string>) => f(r, 'Ansprechpartner', 'Kontakt', 'T055_C061', 'T055.C061'),
};

function recordToCustomer(record: Record<string, string>): DispatcherCustomer {
  const street = F.street(record);
  const zip = F.zip(record);
  const city = F.city(record);
  const address = [street, [zip, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    company: F.name(record) || 'Unbekannt',
    contactName: F.contact(record),
    phone: F.phone(record),
    email: F.email(record),
    address,
    mesonicId: F.number(record),
  };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function DispatcherSearchPanel({ onPick, selectedMesonicId }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Record<string, string>[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 400);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchCustomers(debounced)
      .then((data: { records?: Record<string, string>[] }) => {
        if (!cancelled) setResults(data.records ?? []);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  return (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="text-slate-700 font-semibold mb-2" style={{ fontSize: 13 }}>
          Kunden suchen
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Telefon, Name, Ort..."
            className="w-full rounded-lg bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 pl-8 pr-8 py-2 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
            data-testid="dispatcher-search-input"
          />
          {loading && (
            <Loader2 size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-red-400 animate-spin" />
          )}
          {!loading && query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-2 py-2">
        {error && (
          <div
            className="flex items-center gap-2 p-2 rounded-lg bg-red-50 text-red-600 border border-red-200 m-1"
            style={{ fontSize: 11 }}
          >
            <AlertCircle size={12} /> {error}
          </div>
        )}
        {results === null && !loading && (
          <div className="text-center py-8 text-slate-400" style={{ fontSize: 12 }}>
            Mindestens 2 Zeichen eingeben
          </div>
        )}
        {results && results.length === 0 && !loading && (
          <div className="text-center py-8 text-slate-400" style={{ fontSize: 12 }}>
            Kein Kunde gefunden
          </div>
        )}
        {results && results.length > 0 && (
          <div className="space-y-1" data-testid="dispatcher-search-results">
            {results.map((record, idx) => {
              const customer = recordToCustomer(record);
              const isSelected = selectedMesonicId && customer.mesonicId === selectedMesonicId;
              return (
                <button
                  key={customer.mesonicId || idx}
                  type="button"
                  onClick={() => onPick(customer)}
                  className={`w-full text-left rounded-lg p-2.5 transition-colors group ${
                    isSelected ? 'bg-red-50 border border-red-200' : 'hover:bg-slate-50'
                  }`}
                  data-testid="dispatcher-search-result"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                        <span className="font-semibold text-slate-800 truncate" style={{ fontSize: 12 }}>
                          {customer.company}
                        </span>
                        {customer.mesonicId && (
                          <span className="text-slate-400 flex-shrink-0" style={{ fontSize: 10 }}>
                            #{customer.mesonicId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 ml-4">
                        {customer.address && (
                          <span className="text-slate-500 truncate" style={{ fontSize: 10 }}>
                            <MapPin size={9} className="inline mr-0.5" />
                            {customer.address}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="text-slate-500 flex-shrink-0" style={{ fontSize: 10 }}>
                            <Phone size={9} className="inline mr-0.5" />
                            {customer.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={12} className="text-slate-300 group-hover:text-red-400 flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
