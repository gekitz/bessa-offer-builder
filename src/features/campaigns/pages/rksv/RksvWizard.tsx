import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import SignaturePad, { type SignaturePadHandle } from '../../../offers/components/SignaturePad';
import { saveRecipientPayload, submitOutcome } from '../../api/campaignApi';
import { nextStep, type RksvAnswers, type RksvKnown } from '../../lib/rksvWizard';
import type { Campaign, CampaignRecipient, RksvPayload } from '../../types';

// Type-A Landing-Wizard — dünne React-Hülle um das reine rksvWizard.ts.
// Hält answers-State (RksvPayload), berechnet nextStep(known, answers) pro
// Render, rendert den Schritt und ruft bei jeder Antwort
// saveRecipientPayload (stempelt started_at). Auf einem Terminal-Schritt
// ruft es submitOutcome() → die campaign-outcome Edge-Funktion, die den
// Outcome + Viertl-Write-back server-seitig + idempotent macht (M2/M3).
//
// Die 2-Optionen-Fragen sind Pill-Buttons (ein Tap), nicht Select — per
// Design-Memo (Pills für ≤7 oft-geschaltete Optionen). Der Select-Zwang
// verbietet natives <select>; Buttons sind erlaubt und hier bevorzugt.

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white rounded-xl border-2 border-slate-200 p-6">{children}</div>;
}

function Pill({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-3 rounded-lg border-2 font-semibold text-sm transition-colors ${
        active ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-700 hover:border-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

export default function RksvWizard({
  recipient,
  campaign,
}: {
  recipient: CampaignRecipient;
  campaign: Campaign;
}) {
  // known aus dem Enroll-Snapshot in recipient.payload (siehe rksvEnroll).
  // Die Seite ist eine reine Funktion des Snapshots — kein Live-Viertl-Read.
  const known: RksvKnown = useMemo(() => {
    const p = recipient.payload as RksvPayload;
    return { hardwareNeeded: p.knownHardwareNeeded, versionOk: p.versionOk };
  }, [recipient.payload]);

  const [answers, setAnswers] = useState<RksvAnswers>(() => {
    const p = recipient.payload as RksvPayload;
    return { hasWin10: p.hasWin10, setupSize: p.setupSize };
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'authorize' | 'request_quote' | 'soft_check'>(
    recipient.outcome === 'authorized' ? 'authorize'
      : recipient.outcome === 'quote_requested' ? 'request_quote'
      : recipient.outcome === 'soft_check' ? 'soft_check'
      : null,
  );
  const [signedName, setSignedName] = useState(recipient.name ?? '');
  const sigRef = useRef<SignaturePadHandle>(null);

  const step = nextStep(known, answers);

  // Antwort speichern (payload merge + started_at). Fehler nicht blockierend
  // für die UX — der Funnel-Stempel ist best-effort.
  async function persist(patch: Record<string, unknown>) {
    try {
      await saveRecipientPayload(recipient.token, patch);
    } catch { /* best-effort */ }
  }

  function answerWin10(v: 'ja' | 'nein' | 'weiss_nicht') {
    setAnswers((a) => ({ ...a, hasWin10: v }));
    void persist({ hasWin10: v });
  }
  function answerSetup(v: 'einzelplatz' | 'mehrplatz') {
    setAnswers((a) => ({ ...a, setupSize: v }));
    void persist({ setupSize: v });
  }

  async function onAuthorize() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError('Bitte unterschreiben Sie, um den Auftrag zu erteilen.');
      return;
    }
    if (!signedName.trim()) {
      setError('Bitte geben Sie Ihren Namen an.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await submitOutcome({
        token: recipient.token,
        outcome: 'authorized',
        payload: { signatureData: sigRef.current.toDataURL(), signedByName: signedName.trim() },
      });
      setDone('authorize');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setBusy(false);
    }
  }

  async function onRequestQuote() {
    if (!answers.setupSize) return;
    setBusy(true);
    setError(null);
    try {
      await submitOutcome({
        token: recipient.token,
        outcome: 'quote_requested',
        payload: { hasWin10: 'nein', setupSize: answers.setupSize },
      });
      setDone('request_quote');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setBusy(false);
    }
  }

  async function onSoftCheck() {
    setBusy(true);
    setError(null);
    try {
      await submitOutcome({
        token: recipient.token,
        outcome: 'soft_check',
        payload: { hasWin10: 'weiss_nicht' },
      });
      setDone('soft_check');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setBusy(false);
    }
  }

  // ── Erledigt-Ansichten ──
  if (done) {
    const meta = {
      authorize: {
        title: 'Auftrag erteilt',
        body: 'Vielen Dank. Wir tauschen Ihre Signaturkarte und melden uns zur Terminabstimmung.',
      },
      request_quote: {
        title: 'Angebot angefordert',
        body: 'Danke. Unser Team erstellt Ihnen ein passendes Angebot für die neue Hardware und meldet sich bei Ihnen.',
      },
      soft_check: {
        title: 'Wir prüfen das für Sie',
        body: 'Danke. Wir prüfen Ihre Kasse per Fernwartung und melden uns mit dem passenden nächsten Schritt.',
      },
    }[done];
    return (
      <Card>
        <div className="flex items-center gap-3 mb-2">
          <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={28} />
          <div className="font-bold text-slate-800 text-lg">{meta.title}</div>
        </div>
        <p className="text-slate-600 text-sm leading-relaxed">{meta.body}</p>
      </Card>
    );
  }

  const intro = (
    <div className="mb-4">
      <h1 className="text-xl font-bold text-slate-800 mb-1">{campaign.title || 'RKSV-Signaturkarte'}</h1>
      <p className="text-slate-500 text-sm">
        Ihre RKSV-Signaturkarte muss getauscht werden. Beantworten Sie kurz die folgende Frage,
        damit wir den richtigen nächsten Schritt für Sie wählen.
      </p>
    </div>
  );

  return (
    <Card>
      {intro}

      {step.kind === 'question' && step.id === 'has_win10' && (
        <div>
          <div className="font-semibold text-slate-800 mb-3">Haben Sie eine Kasse mit Windows 10?</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Pill onClick={() => answerWin10('ja')}>Ja</Pill>
            <Pill onClick={() => answerWin10('nein')}>Nein</Pill>
            <Pill onClick={() => answerWin10('weiss_nicht')}>Weiß nicht</Pill>
          </div>
          <p className="text-slate-400 text-xs mt-3">
            "Weiß nicht" ist völlig in Ordnung — wir prüfen das dann für Sie.
          </p>
        </div>
      )}

      {step.kind === 'question' && step.id === 'setup_size' && (
        <div>
          <div className="font-semibold text-slate-800 mb-3">Wie viele Kassen-Arbeitsplätze haben Sie?</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Pill active={answers.setupSize === 'einzelplatz'} onClick={() => answerSetup('einzelplatz')}>Einzelplatz-Kasse</Pill>
            <Pill active={answers.setupSize === 'mehrplatz'} onClick={() => answerSetup('mehrplatz')}>Mehrplatz-Kasse</Pill>
          </div>
        </div>
      )}

      {step.kind === 'terminal' && step.id === 'authorize' && (
        <div>
          <div className="font-semibold text-slate-800 mb-1">Auftrag zum Kartentausch erteilen</div>
          <p className="text-slate-500 text-sm mb-4">
            Ihre Kasse ist bereit. Erteilen Sie uns den Auftrag zum Tausch der Signaturkarte
            mit Ihrer Unterschrift. Die Kosten werden wie gewohnt über die reguläre
            Service-/Rechnungsstellung abgerechnet.
          </p>
          <input
            type="text"
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="Ihr Name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none"
          />
          <SignaturePad ref={sigRef} />
          <button
            onClick={onAuthorize}
            disabled={busy}
            className="w-full mt-4 bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            Auftrag erteilen
          </button>
        </div>
      )}

      {step.kind === 'terminal' && step.id === 'request_quote' && (
        <div>
          <div className="font-semibold text-slate-800 mb-1">Angebot anfordern</div>
          <p className="text-slate-500 text-sm mb-4">
            Ihre bestehende Kasse kann das verpflichtende Update nicht mehr durchführen.
            Wir erstellen Ihnen ein passendes Angebot für die neue Hardware.
          </p>
          <button
            onClick={onRequestQuote}
            disabled={busy}
            className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            Angebot anfordern
          </button>
        </div>
      )}

      {step.kind === 'terminal' && step.id === 'soft_check' && (
        <div>
          <div className="font-semibold text-slate-800 mb-1">Das prüfen wir für Sie</div>
          <p className="text-slate-500 text-sm mb-4">
            Kein Problem — wir prüfen Ihre Kasse per Fernwartung und melden uns mit dem
            passenden nächsten Schritt bei Ihnen.
          </p>
          <button
            onClick={onSoftCheck}
            disabled={busy}
            className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={16} />}
            Prüfung anfordern
          </button>
        </div>
      )}

      {error && <div className="mt-3 text-sm text-rose-600">{error}</div>}
    </Card>
  );
}
