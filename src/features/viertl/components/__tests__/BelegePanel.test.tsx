import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { BelegeCacheState } from '../../api/belegeApi';

// loadCachedBelege wird beim Mount aufgerufen — mocken, damit kein Supabase/
// Netzwerk nötig ist. syncBelege wird hier nicht ausgelöst.
const loadCachedBelege = vi.fn<[], Promise<BelegeCacheState>>();
vi.mock('../../api/belegeApi', () => ({
  loadCachedBelege: (...args: unknown[]) => loadCachedBelege(...(args as [])),
  syncBelege: vi.fn(),
}));

import BelegePanel from '../BelegePanel';

const CACHE: BelegeCacheState = {
  syncedIndex: 1,
  syncedAt: '2026-09-01T00:00:00Z',
  belege: [
    {
      index: 1,
      laufnummer: '1',
      belegart: '8',
      datumFaktura: '2026-08-01',
      fetchedAt: '2026-09-01T00:00:00Z',
      positions: [
        // Hardware (Erlöskonto 8000, Datentyp 1) → grün, anklickbar
        { datentyp: '1', artikelnummer: '38100500', bezeichnung: 'ORDERMAN MAX2', menge: 1, einzelpreis: 3000, erloeskonto: '8000' },
        // Kein Hardware-Konto → nicht anklickbar
        { datentyp: '1', artikelnummer: '30003046', bezeichnung: 'KASSEN-PROGRAMMIERUNG', menge: 2, einzelpreis: 90, erloeskonto: '8040' },
      ],
    },
  ],
};

describe('BelegePanel — Hardware in Feld übernehmen', () => {
  beforeEach(() => {
    loadCachedBelege.mockReset();
    loadCachedBelege.mockResolvedValue(CACHE);
  });

  it('klick auf eine grüne Hardware-Zeile ruft onPickHardware mit der Bezeichnung', async () => {
    const onPickHardware = vi.fn();
    const user = userEvent.setup();
    render(<BelegePanel kdnr="272765" onPickHardware={onPickHardware} />);

    // Beleg-Kopf aufklappen
    const header = await screen.findByRole('button', { name: /Belegart 8/ });
    await user.click(header);

    // Hardware-Zeile anklicken
    await user.click(screen.getByText(/ORDERMAN MAX2/));
    expect(onPickHardware).toHaveBeenCalledTimes(1);
    expect(onPickHardware).toHaveBeenCalledWith('ORDERMAN MAX2');
  });

  it('klick auf eine Nicht-Hardware-Zeile tut nichts', async () => {
    const onPickHardware = vi.fn();
    const user = userEvent.setup();
    render(<BelegePanel kdnr="272765" onPickHardware={onPickHardware} />);

    await user.click(await screen.findByRole('button', { name: /Belegart 8/ }));
    await user.click(screen.getByText('KASSEN-PROGRAMMIERUNG'));
    expect(onPickHardware).not.toHaveBeenCalled();
  });

  it('ohne onPickHardware sind die Zeilen nicht anklickbar (kein Titel)', async () => {
    const user = userEvent.setup();
    render(<BelegePanel kdnr="272765" />);

    await user.click(await screen.findByRole('button', { name: /Belegart 8/ }));
    const hwCell = screen.getByText(/ORDERMAN MAX2/).closest('tr');
    expect(hwCell).not.toHaveAttribute('title');
  });
});
