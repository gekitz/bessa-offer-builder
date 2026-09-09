import { useState } from 'react';
import Select from './Select';
import { useCustomerContacts } from '../hooks/useCustomerContacts';
import { contactDisplayName, type Contact } from '../lib/mesonicContacts';

interface ContactSelectProps {
  // Mesonic-Kontonummer des gewählten Bestandskunden. Ohne diese wird nichts
  // gerendert (es gibt keine Kontakte zum Laden).
  mesonicId: string | null | undefined;
  // Wird mit dem gewählten Ansprechpartner aufgerufen — der Aufrufer füllt
  // daraus die Kundendaten-Felder (Name/E-Mail/Telefon).
  onPick: (contact: Contact) => void;
  size?: 'sm' | 'md';
}

// Dropdown der Mesonic-Ansprechpartner eines Kontos. Erscheint erst, wenn ein
// Bestandskunde gewählt wurde (mesonicId vorhanden) und lädt dessen Kontakte
// automatisch. Die Auswahl füllt die vorhandenen Kundendaten-Felder; die Felder
// bleiben danach frei editierbar.
export default function ContactSelect({ mesonicId, onPick, size = 'md' }: ContactSelectProps) {
  const { contacts, loading, error } = useCustomerContacts(mesonicId);
  const [selected, setSelected] = useState('');

  // Kein Konto gewählt → nichts anzeigen.
  if (!mesonicId) return null;

  // Fehler beim Laden sichtbar, aber unaufdringlich machen.
  if (error) {
    return <p className="text-xs text-rose-600">Ansprechpartner konnten nicht geladen werden.</p>;
  }

  // Fertig geladen und leer → keine Auswahl anbieten.
  if (!loading && contacts.length === 0) return null;

  // Index als stabiler Options-Wert (Kontaktnummer kann fehlen/leer sein).
  const options = contacts.map((c, i) => ({
    value: String(i),
    label: contactDisplayName(c),
    hint: c.abteilung || undefined,
  }));

  return (
    <Select
      value={selected}
      onChange={(v) => {
        setSelected(v);
        const c = contacts[Number(v)];
        if (c) onPick(c);
      }}
      options={options}
      placeholder={loading ? 'Ansprechpartner werden geladen…' : 'Ansprechpartner übernehmen…'}
      disabled={loading}
      size={size}
      ariaLabel="Ansprechpartner aus Mesonic wählen"
    />
  );
}
