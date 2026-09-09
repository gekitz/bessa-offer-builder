import { useEffect, useState } from 'react';
import { fetchContacts, type Contact } from '../lib/mesonicContacts';

interface State {
  contacts: Contact[];
  loading: boolean;
  error: string | null;
}

// Lädt die Ansprechpartner eines Kontos (Mesonic Type 7) automatisch, sobald
// eine Kontonummer vorliegt — für die Auswahl beim Bestandskunden in Angebot
// und Ticket. Ohne mesonicId passiert nichts (leerer Zustand). Ein Wechsel der
// Kontonummer startet einen neuen Abruf und verwirft veraltete Ergebnisse.
export function useCustomerContacts(mesonicId: string | null | undefined): State {
  const [state, setState] = useState<State>({ contacts: [], loading: false, error: null });

  useEffect(() => {
    const kdnr = (mesonicId ?? '').trim();
    if (!kdnr) {
      setState({ contacts: [], loading: false, error: null });
      return;
    }

    let cancelled = false;
    setState({ contacts: [], loading: true, error: null });
    fetchContacts(kdnr)
      .then((contacts) => {
        if (!cancelled) setState({ contacts, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ contacts: [], loading: false, error: e instanceof Error ? e.message : String(e) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mesonicId]);

  return state;
}
