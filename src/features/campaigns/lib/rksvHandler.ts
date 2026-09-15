// Type A (RKSV) — der typ-spezifische Terminal-/onOutcome-Handler.
//
// Vom RksvWizard bei einer Terminal-Aktion aufgerufen. Drei Terminal-
// Aktionen bilden drei Outcomes ab; jeder tut: (a) recordOutcome() über
// campaignApi (anon-sicher, funnel+payload), dann (b) Write-back auf die
// Viertl-Zeile + ein viertl_event.
//
// Write-back-Mechanismus (bewusste Entscheidung; korrigiert ggü. dem
// ersten Plan-Entwurf): Die öffentliche Landing-Page ist anonym, ABER die
// RLS auf viertl_licenses/viertl_events ist permissiv (FOR ALL USING(true))
// und die App nutzt EINEN anon-Client — ein anonymer Write GELINGT also
// auf DB-Ebene. Der Write-back wird daher HIER im Handler-Modul gemacht
// (testbar mit dem makeChain-Harness) statt in einem untestbaren
// PL/pgSQL-Trigger. Es gibt keinen Staff-Aktor auf der öffentlichen Seite,
// deshalb wird ein Sentinel-Aktor { id:'campaign', name:'RKSV-Kampagne' }
// mitgeschickt — so sind self-reported Antworten im viertl_events-Log
// klar von einer Techniker-Bestätigung (CRM-TeamViewer) unterscheidbar.

import { recordOutcome } from '../api/campaignApi';
import { addNote, updateLicense } from '../../viertl/api/viertlApi';
import type { ViertlActor } from '../../viertl/types';
import type { CampaignRecipient, RksvPayload } from '../types';

// Sentinel-Aktor für Kampagnen-Write-backs — kein Staff-Benutzer auf der
// öffentlichen Landing-Page.
export const CAMPAIGN_ACTOR: ViertlActor = { id: 'campaign', name: 'RKSV-Kampagne' };

export type RksvTerminal = 'authorize' | 'request_quote' | 'soft_check';

// "Auftrag erteilen" (preis-frei) — bereit, kann autorisieren.
export async function authorize(
  recipient: CampaignRecipient,
  signature: { signatureData: string; signedByName: string },
): Promise<CampaignRecipient> {
  const patch: RksvPayload = {
    signatureData: signature.signatureData,
    signedByName: signature.signedByName,
  };
  const updated = await recordOutcome(recipient.token, 'authorized', patch as Record<string, unknown>);
  if (recipient.subjectType === 'viertl_license') {
    await addNote(recipient.subjectId, 'RKSV-Kampagne: Auftrag erteilt (self-reported)', CAMPAIGN_ACTOR);
  }
  return updated;
}

// "Angebot anfordern" — braucht neue Hardware (self-reported hasWin10=nein).
export async function requestQuote(
  recipient: CampaignRecipient,
  answers: { setupSize: 'einzelplatz' | 'mehrplatz' },
): Promise<CampaignRecipient> {
  const patch: RksvPayload = { hasWin10: 'nein', setupSize: answers.setupSize };
  const updated = await recordOutcome(recipient.token, 'quote_requested', patch as Record<string, unknown>);
  if (recipient.subjectType === 'viertl_license') {
    // Self-reported Hardware-Bedarf zurückschreiben. Die Feld-Änderung
    // protokolliert der Viertl-Audit-Trigger; der explizite Note liefert
    // die menschenlesbare Zeitleiste.
    await updateLicense(recipient.subjectId, { hardwareNeeded: true }, CAMPAIGN_ACTOR);
    const label = answers.setupSize === 'mehrplatz' ? 'Mehrplatz' : 'Einzelplatz';
    await addNote(
      recipient.subjectId,
      `RKSV-Kampagne: Angebot angefordert (${label}, neue Hardware, self-reported)`,
      CAMPAIGN_ACTOR,
    );
  }
  return updated;
}

// "Weiß nicht" — Remote-OS-Check anfordern (soft auth + Rückruf).
export async function softCheck(recipient: CampaignRecipient): Promise<CampaignRecipient> {
  const patch: RksvPayload = { hasWin10: 'weiss_nicht' };
  const updated = await recordOutcome(recipient.token, 'soft_check', patch as Record<string, unknown>);
  if (recipient.subjectType === 'viertl_license') {
    await addNote(
      recipient.subjectId,
      'RKSV-Kampagne: Remote-OS-Check angefordert (weiß nicht, self-reported)',
      CAMPAIGN_ACTOR,
    );
  }
  return updated;
}
