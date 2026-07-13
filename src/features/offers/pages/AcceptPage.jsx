import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

import { supabase } from '../../../lib/supabase';
import { getOfferByShareCode, acceptOfferWithSignature } from '../../../lib/offerApi';
import SignaturePad from '../components/SignaturePad';
import { ALL } from '../data/catalogs';
import { computeAcceptTotals } from '../../../lib/acceptTotals';
import { fmt } from '../../../lib/format';
import { TIER_MONTHS } from '../../../data/tiers';

function AcceptPlanCard({ title, subtitle, rows, cta, onSelect, loading, disabled, highlight }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${highlight ? 'border-red-300' : 'border-slate-200'} mb-4 overflow-hidden`}>
      <div className="p-5">
        <div className="mb-3">
          <div className="font-bold text-slate-800 text-lg">{title}</div>
          <div className="text-sm text-slate-500">{subtitle}</div>
        </div>
        <div className="space-y-2 text-sm bg-slate-50 rounded-lg p-3 mb-4">
          {rows.map((r, i) => (
            <div key={i} className={`flex justify-between ${r.emphasis ? 'pt-2 border-t border-slate-200 font-semibold text-slate-800' : 'text-slate-700'}`}>
              <span>{r.label}</span>
              <span className={r.emphasis ? '' : 'font-medium'}>€ {fmt(r.value)}{r.per ? r.per : ''}</span>
            </div>
          ))}
        </div>
        <button onClick={onSelect} disabled={disabled}
          className="w-full bg-red-600 text-white font-semibold py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-wait transition-colors">
          {loading ? 'Wird weitergeleitet…' : cta}
        </button>
      </div>
    </div>
  );
}

function AcceptanceDetails({ offer }) {
  const data = offer.offer_data || {};
  const tier = data.globalTier || '12mo';
  const raten = data.raten || 12;
  const tierMonths = TIER_MONTHS[tier] || 12;
  const isOpenEnded = tier === '12mo';

  const monthlyNet = Number(offer.total_monthly || 0);
  const onceNet = Number(offer.total_once || 0);
  const periodNet = Number(offer.total_period || 0);
  const yearlyNet = Math.max(0, periodNet - monthlyNet * tierMonths - onceNet);

  const VAT = 1.2, FIN = 1.08;
  const monthlyBrutto = monthlyNet * VAT;
  const onceBrutto = onceNet * VAT;
  const yearlyBrutto = yearlyNet * VAT;
  const periodBrutto = periodNet * VAT;

  const plan = offer.plan_chosen;
  const planName = plan === 'standard' ? 'Standard'
    : plan === 'ratenzahlung' ? 'Ratenzahlung'
    : plan === 'miete' ? 'Miete' : '—';

  const startDate = offer.service_start_date
    ? new Date(offer.service_start_date + 'T00:00:00Z')
    : new Date(offer.accepted_at);
  const formattedStart = startDate.toLocaleDateString('de-AT');
  let endDate = null;
  if (plan === 'miete' || !isOpenEnded) {
    endDate = new Date(startDate.getTime());
    endDate.setUTCMonth(endDate.getUTCMonth() + tierMonths);
  }
  const formattedEnd = endDate ? endDate.toLocaleDateString('de-AT') : null;

  const rows = [];
  if (plan === 'standard') {
    if (onceBrutto > 0) rows.push({ label: 'Einmalig', value: onceBrutto, per: ' brutto' });
    if (monthlyBrutto > 0) rows.push({ label: 'Monatsgebühr', value: monthlyBrutto, per: '/Monat brutto' });
    if (yearlyBrutto > 0) rows.push({ label: 'Wartung', value: yearlyBrutto, per: '/Jahr brutto' });
  } else if (plan === 'ratenzahlung') {
    const totalFinanced = periodBrutto * FIN;
    const anzahlung = totalFinanced * 0.3;
    const ratePerMonth = (totalFinanced * 0.7) / raten;
    rows.push({ label: 'Gesamtbetrag (inkl. 8%)', value: totalFinanced, per: ' brutto' });
    rows.push({ label: 'Anzahlung (30%)', value: anzahlung, per: ' brutto' });
    rows.push({ label: `${raten} × Rate`, value: ratePerMonth, per: '/Monat brutto' });
    if (isOpenEnded && monthlyBrutto > 0) {
      rows.push({ label: `Ab Monat ${raten + 1}: Monatsgebühr`, value: monthlyBrutto, per: '/Monat brutto' });
    }
    if (isOpenEnded && yearlyBrutto > 0) {
      rows.push({ label: 'Wartung', value: yearlyBrutto, per: '/Jahr brutto' });
    }
  } else if (plan === 'miete') {
    const mieteMonthly = (periodBrutto / tierMonths) * FIN;
    rows.push({ label: 'Kaution (einmalig)', value: 500, per: ' brutto' });
    rows.push({ label: 'Miete monatlich (inkl. 8%)', value: mieteMonthly, per: '/Monat brutto' });
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-slate-100">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white border-2 border-emerald-200 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600 flex-shrink-0" size={32} />
            <div>
              <div className="font-bold text-slate-800 text-lg">Angebot angenommen</div>
              <div className="text-sm text-slate-500">
                {new Date(offer.accepted_at).toLocaleString('de-AT', { dateStyle: 'long', timeStyle: 'short' })}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-bold text-slate-700" style={{ fontSize: 13 }}>ZAHLUNGSPLAN</div>
            <div className="text-sm font-semibold text-slate-800">{planName}</div>
          </div>
          <div className="space-y-2 text-sm bg-slate-50 rounded-lg p-3">
            {rows.length === 0 ? (
              <div className="text-slate-500 text-center py-2">Keine Details verfügbar</div>
            ) : rows.map((r, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-slate-600">{r.label}</span>
                <span className="font-semibold text-slate-800 whitespace-nowrap">€ {fmt(r.value)}{r.per}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border-2 border-slate-200 mb-4 p-5">
          <div className="font-bold text-slate-700 mb-3" style={{ fontSize: 13 }}>ABRECHNUNG</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Leistungsbeginn / erste Abbuchung</span>
              <span className="font-medium text-slate-800">{formattedStart}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Laufzeit</span>
              <span className="font-medium text-slate-800">
                {plan === 'miete' ? `${tierMonths} Monate` : isOpenEnded ? 'Unbefristet' : `${tierMonths} Monate`}
              </span>
            </div>
            {formattedEnd && (
              <div className="flex justify-between">
                <span className="text-slate-600">Vertragsende</span>
                <span className="font-medium text-slate-800">{formattedEnd}</span>
              </div>
            )}
            {monthlyBrutto > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Folge-Abbuchungen Monatsgebühr</span>
                <span className="font-medium text-slate-800">jeweils zum {startDate.getDate()}.</span>
              </div>
            )}
            {yearlyBrutto > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-600">Wartung-Verrechnung</span>
                <span className="font-medium text-slate-800">jährlich ab {formattedStart}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-slate-600 text-center">
          Bei Fragen melden Sie sich bitte bei Ihrem Ansprechpartner.
        </div>
      </div>
    </div>
  );
}

export default function AcceptPage({ shareCode }) {
  const [offer, setOffer] = useState(null);
  const [error, setError] = useState('');
  const [submittingPlan, setSubmittingPlan] = useState(null);
  const [processingReturn, setProcessingReturn] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stage = params.get('s');
    const cs = params.get('cs');

    async function load() {
      try {
        const fresh = await getOfferByShareCode(shareCode);
        if (stage === 'success' && cs && !fresh.accepted_at) {
          setProcessingReturn(true);
          const { data: result, error: fnErr } = await supabase.functions.invoke(
            'stripe-complete-acceptance',
            { body: { shareCode, checkoutSessionId: cs } },
          );
          if (fnErr) throw new Error(fnErr.message || 'Verarbeitungsfehler');
          if (result?.error) throw new Error(result.error);
          const updated = await getOfferByShareCode(shareCode);
          setOffer(updated);
          window.history.replaceState({}, '', `${window.location.pathname}?a=${shareCode}`);
        } else {
          setOffer(fresh);
        }
      } catch (e) {
        setError(e?.message || 'Angebot nicht gefunden.');
      } finally {
        setProcessingReturn(false);
      }
    }
    load();
  }, [shareCode]);

  if (processingReturn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="animate-spin text-red-600 mx-auto mb-3" size={36} />
          <div className="font-medium text-slate-700">Zahlung wird eingerichtet…</div>
          <div className="text-xs text-slate-500 mt-1">Bitte Seite nicht schließen</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-slate-100">
        <div className="bg-white border-2 border-red-200 rounded-xl p-6 max-w-md text-center">
          <div className="font-bold text-red-800 mb-2">Angebot nicht gefunden</div>
          <div className="text-sm text-slate-600">{error}</div>
        </div>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (offer.accepted_at) {
    return <AcceptanceDetails offer={offer} />;
  }

  // No payment for this offer → accept by signature (no Stripe).
  if (!offer.payment_enabled) {
    return <SignatureAccept offer={offer} shareCode={shareCode} onAccepted={setOffer} />;
  }

  const data = offer.offer_data || {};
  const raten = data.raten || 12;

  // Prefer the snapshot frozen at send time; fall back to live computation
  // for offers sent before snapshotting existed.
  const { monthly, once, yearly, periodTotal, maxMonths } =
    data.acceptSnapshot || computeAcceptTotals(data, ALL);

  const onceBrutto = once * 1.2;
  const monthlyBrutto = monthly * 1.2;
  const yearlyBrutto = yearly * 1.2;
  const periodBrutto = periodTotal * 1.2;

  async function pickPlan(planId) {
    setSubmittingPlan(planId);
    try {
      const { data: result, error } = await supabase.functions.invoke('stripe-create-checkout', {
        body: { shareCode, plan: planId },
      });
      if (error) throw new Error(error.message || 'Checkout-Fehler');
      if (!result?.url) throw new Error(result?.error || 'Keine Checkout-URL erhalten');
      window.location.href = result.url;
    } catch (e) {
      alert(e.message);
      setSubmittingPlan(null);
    }
  }

  const startDateText = offer.service_start_date
    ? new Date(offer.service_start_date).toLocaleDateString('de-AT')
    : 'sofort';

  const planA = [];
  if (onceBrutto > 0) planA.push({ label: 'Einmalige Kosten', value: onceBrutto });
  if (monthlyBrutto > 0) planA.push({ label: 'Monatlich', value: monthlyBrutto, per: '/Mo' });
  if (yearlyBrutto > 0) planA.push({ label: 'Wartung jährlich', value: yearlyBrutto, per: '/J' });

  const ratenTotal = periodBrutto * 1.08;
  const planB = [
    { label: `Gesamtbetrag (${raten} Raten, +8%)`, value: ratenTotal },
    { label: 'Anzahlung (30%)', value: ratenTotal * 0.3 },
    { label: `Rate (${raten}×)`, value: (ratenTotal * 0.7) / raten, per: '/Mo', emphasis: true },
  ];

  const mieteMonthly = (periodBrutto / maxMonths) * 1.08;
  const planC = [
    { label: 'Kaution (rückzahlbar)', value: 500 },
    { label: `Miete (${maxMonths} Monate)`, value: mieteMonthly, per: '/Mo', emphasis: true },
  ];

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-block bg-red-600 text-white font-bold px-4 py-2 rounded-lg mb-3" style={{ fontSize: 18 }}>KITZ</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Angebot annehmen</h1>
          <p className="text-slate-600 text-sm">Wählen Sie Ihre bevorzugte Zahlungsart</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <div className="text-xs text-slate-500 mb-1">Angebot für</div>
          <div className="font-bold text-slate-800 mb-3">
            {offer.customer_company || offer.customer_name || 'Kunde'}
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Leistungsbeginn</span>
            <span className="font-semibold text-slate-800">{startDateText}</span>
          </div>
        </div>

        <AcceptPlanCard
          title="Standard"
          subtitle="Monatliche Zahlung, Einmalkosten bei Start"
          rows={planA}
          cta="Standard wählen"
          onSelect={() => pickPlan('standard')}
          loading={submittingPlan === 'standard'}
          disabled={!!submittingPlan}
          highlight
        />
        {periodBrutto > 0 && (
          <AcceptPlanCard
            title="Ratenzahlung"
            subtitle={`${raten} Raten, danach Standardtarif`}
            rows={planB}
            cta="Ratenzahlung wählen"
            onSelect={() => pickPlan('ratenzahlung')}
            loading={submittingPlan === 'ratenzahlung'}
            disabled={!!submittingPlan}
          />
        )}
        {periodBrutto > 0 && (
          <AcceptPlanCard
            title="Miete"
            subtitle={`${maxMonths} Monate Mietvertrag inkl. Hardware`}
            rows={planC}
            cta="Miete wählen"
            onSelect={() => pickPlan('miete')}
            loading={submittingPlan === 'miete'}
            disabled={!!submittingPlan}
          />
        )}

        <div className="text-center text-xs text-slate-500 mt-8">
          Sichere Zahlung über Stripe · alle Preise inkl. 20% USt
        </div>
      </div>
    </div>
  );
}

// Signature-based acceptance (no payment). Records the customer's
// signature + name and marks the offer accepted → the DB trigger creates
// the fulfillment ticket.
function SignatureAccept({ offer, shareCode, onAccepted }) {
  const padRef = useRef(null);
  const [name, setName] = useState(offer.customer_name || offer.customer_company || '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    if (!name.trim()) { setErr('Bitte geben Sie Ihren Namen ein.'); return; }
    if (!padRef.current || padRef.current.isEmpty()) { setErr('Bitte unterschreiben Sie im Feld.'); return; }
    setSubmitting(true);
    setErr('');
    try {
      const updated = await acceptOfferWithSignature(shareCode, padRef.current.toDataURL(), name.trim());
      onAccepted(updated);
    } catch (e) {
      setErr(e?.message || 'Das Angebot konnte nicht angenommen werden.');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-block bg-red-600 text-white font-bold px-4 py-2 rounded-lg mb-3" style={{ fontSize: 18 }}>KITZ</div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Angebot annehmen</h1>
          <p className="text-slate-600 text-sm">Mit Ihrer Unterschrift nehmen Sie das Angebot verbindlich an.</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="text-xs text-slate-500 mb-1">Angebot für</div>
          <div className="font-bold text-slate-800">{offer.customer_company || offer.customer_name || 'Kunde'}</div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <label className="block text-xs font-medium text-slate-600 mb-1">Unterschrift</label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-1 mb-3">
            <SignaturePad ref={padRef} width={520} height={200} />
          </div>
          <button
            type="button"
            onClick={() => padRef.current?.clear()}
            className="text-xs text-slate-500 hover:text-slate-700 mb-3"
          >
            Zurücksetzen
          </button>
          <label className="block text-xs font-medium text-slate-600 mb-1">Name des Unterzeichners</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vor- und Nachname"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          {err && <div className="text-sm text-red-600 mb-3">{err}</div>}
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Verbindlich annehmen
          </button>
        </div>

        <div className="text-center text-xs text-slate-500 mt-6">KITZ Computer + Office GmbH · alle Preise inkl. 20% USt</div>
      </div>
    </div>
  );
}
