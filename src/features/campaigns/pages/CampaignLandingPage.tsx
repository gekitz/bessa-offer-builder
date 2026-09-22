import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { getCampaign, getRecipientByToken, markLanded } from '../api/campaignApi';
import type { Campaign, CampaignRecipient } from '../types';
import RksvWizard from './rksv/RksvWizard';

// Öffentliche Kampagnen-Landing (?c={token}). Kein App-Shell, keine Auth —
// exakt wie AcceptPage. Lädt den Empfänger per Token, stempelt landed_at,
// liest campaign.type und dispatcht zur Typ-Landing-Komponente.
//
// Nutzt den anon supabase-Client (permissive RLS) direkt über campaignApi.

// Zentrierte KITZ-Karte, wie die Accept-Seite (Header, keine Navigation).
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 text-white font-bold rounded-lg" style={{ width: 40, height: 40, fontSize: 13 }}>
            KITZ
          </div>
          <div className="text-slate-500 text-sm">Computer &amp; Office GmbH</div>
        </div>
        {children}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border-2 border-slate-200 p-6 text-center text-slate-600">{children}</div>;
}

export default function CampaignLandingPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recipient, setRecipient] = useState<CampaignRecipient | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rec = await getRecipientByToken(token);
        if (cancelled) return;
        if (!rec) {
          setError('Dieser Link ist ungültig oder abgelaufen.');
          setLoading(false);
          return;
        }
        // landed_at fire-and-forget (nur einmalig, verändert die Anzeige nicht).
        void markLanded(token).catch(() => { /* Funnel-Stempel ist best-effort */ });
        const camp = await getCampaign(rec.campaignId);
        if (cancelled) return;
        setRecipient(rec);
        setCampaign(camp);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Fehler beim Laden');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <Chrome>
        <Centered>
          <Loader2 className="animate-spin text-red-400 inline-block" size={24} />
        </Centered>
      </Chrome>
    );
  }

  if (error || !recipient || !campaign) {
    return (
      <Chrome>
        <Centered>
          <div className="font-semibold text-slate-800 mb-1">Link nicht verfügbar</div>
          <div className="text-sm">{error ?? 'Dieser Link ist ungültig oder abgelaufen.'}</div>
        </Centered>
      </Chrome>
    );
  }

  return (
    <Chrome>
      {campaign.type === 'rksv_signature' ? (
        <RksvWizard recipient={recipient} campaign={campaign} />
      ) : (
        // Type B (PoS-Ablöse) — in diesem Scope nicht gebaut. Der switch
        // existiert, damit Type B später hier einklinkt.
        <Centered>
          <div className="font-semibold text-slate-800 mb-1">In Vorbereitung</div>
          <div className="text-sm">Diese Kampagne ist noch nicht verfügbar. Bitte kontaktieren Sie uns direkt.</div>
        </Centered>
      )}
    </Chrome>
  );
}
