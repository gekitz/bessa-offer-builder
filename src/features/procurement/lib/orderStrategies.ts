// Per-supplier ordering strategies (data-driven; keyed by
// suppliers.order_method). Each supplier's method selects one strategy:
//
//   api       → Jarltech REST order (binding, allowlist-gated)
//   email     → order e-mail to the supplier (Orderman, …)
//   email_xml → order XML emailed as an attachment (Pulsa)
//   manual    → NOT handled here; recorded internally via the inline
//               "Bestellen" flow (a human places the order)
//
// A strategy centralises: the button label, whether it needs the binding-
// order permission, which lines can be ordered, and how the external
// action is performed. The shared tail — recording the consolidated
// purchase order + flipping requests to `ordered` — lives in the page, so
// it runs identically for every strategy.

import type { AggregatedLine, SupplierGroup } from './aggregate';
import type { JarltechItemInfo } from './jarltechNormalize';
import type { ShippingAddress } from './shipping';
import { buildPulsaOrderXml, formatPulsaDate } from './pulsaOrderXml';
import type { OrderMethod, PulsaMatch, RequestableProduct, Supplier } from '../types';
import { placeJarltechOrder } from '../api/jarltechApi';
import { sendSupplierOrderEmail, sendSupplierOrderXml } from '../api/procurementApi';

export interface OrderableSplit {
  orderable: AggregatedLine[];
  blocked: Array<{ line: AggregatedLine; reason: string }>;
}

export interface PlaceArgs {
  group: SupplierGroup;
  supplier: Supplier | null; // the ordering supplier (for Kundennummer etc.)
  productsById: Map<string, RequestableProduct>;
  jarltechInfo: Map<string, JarltechItemInfo>;
  pulsaByProductId: Map<string, PulsaMatch>;
  shippingAddress: ShippingAddress; // the selected Standort — Liefer- + Rechnungsadresse
  standortLabel: string;
  orderable: AggregatedLine[];
}

export interface OrderStrategy {
  method: Exclude<OrderMethod, 'manual'>;
  gated: boolean; // requires the binding-order permission (allowlist)
  buttonLabel: string;
  confirmTitle: string;
  // Footer note in the confirm modal; gets the supplier's order recipient
  // (email suppliers show it, e.g. "… an den Lieferanten (info@pulsa.de) …").
  confirmNote: (recipientEmail: string | null) => string;
  // Split a group's lines into orderable vs blocked (e.g. missing id).
  split: (group: SupplierGroup, productsById: Map<string, RequestableProduct>) => OrderableSplit;
  // Perform the external action; returns a note/reference for the PO.
  place: (args: PlaceArgs) => Promise<string | null>;
}

const jarltechIdOf = (
  line: AggregatedLine,
  productsById: Map<string, RequestableProduct>,
): string | null => (line.productId ? productsById.get(line.productId)?.jarltechItemId ?? null : null);

const apiStrategy: OrderStrategy = {
  method: 'api',
  gated: true,
  buttonLabel: 'Bei Jarltech bestellen',
  confirmTitle: 'Verbindlich bei Jarltech bestellen',
  confirmNote: () => 'Die Bestellung ist verbindlich und wird als eine Sendung geliefert (keine Teillieferung).',
  split(group, productsById) {
    const orderable: AggregatedLine[] = [];
    const blocked: OrderableSplit['blocked'] = [];
    for (const line of group.lines) {
      if (jarltechIdOf(line, productsById)) orderable.push(line);
      else blocked.push({ line, reason: 'Keine Jarltech-Artikelkennung' });
    }
    return { orderable, blocked };
  },
  async place({ productsById, shippingAddress, standortLabel, orderable }) {
    const items = orderable.map((l) => ({
      jarltechItemId: jarltechIdOf(l, productsById)!,
      quantity: l.totalQty,
    }));
    const order = await placeJarltechOrder({
      items,
      shippingAddress,
      note: `KITZ ${standortLabel}`,
    });
    const ref = order?.api_request_id != null ? String(order.api_request_id) : null;
    return `Jarltech-Bestellung${ref ? ` (Ref ${ref})` : ''} · Lieferung ${standortLabel}`;
  },
};

const emailStrategy: OrderStrategy = {
  method: 'email',
  gated: false,
  buttonLabel: 'Per E-Mail bestellen',
  confirmTitle: 'Bestellung per E-Mail senden',
  confirmNote: (to) => `Die Bestellung geht per E-Mail an den Lieferanten${to ? ` (${to})` : ''}; du bekommst eine Kopie (CC).`,
  // Email orders don't need a per-item id — every line is orderable.
  split(group) {
    return { orderable: group.lines, blocked: [] };
  },
  async place({ group, productsById, shippingAddress, standortLabel, orderable }) {
    const items = orderable.map((l) => {
      // Prefer the supplier's own article number (e.g. Orderman-Art.Nr.)
      // so the supplier can identify the item; fall back to our code.
      const supplierArticleNo = l.productId ? productsById.get(l.productId)?.supplierArticleNo : null;
      return {
        name: l.productName,
        code: supplierArticleNo ?? l.productCode ?? undefined,
        qty: l.totalQty,
      };
    });
    const { to } = await sendSupplierOrderEmail({
      supplierId: group.supplierId!,
      items,
      shippingAddress,
      note: `Lieferung ${standortLabel}`,
    });
    return `Bestell-E-Mail an ${to} · Lieferung ${standortLabel}`;
  },
};

const pulsaBestellnummerOf = (
  line: AggregatedLine,
  productsById: Map<string, RequestableProduct>,
): string | null => (line.productId ? productsById.get(line.productId)?.pulsaBestellnummer ?? null : null);

const emailXmlStrategy: OrderStrategy = {
  method: 'email_xml',
  gated: false,
  buttonLabel: 'Per E-Mail bestellen',
  confirmTitle: 'Bestellung als XML senden',
  confirmNote: (to) => `Die Bestellung geht als XML-Anhang an den Lieferanten${to ? ` (${to})` : ''}; du bekommst eine Kopie (CC).`,
  // Needs a Pulsa-Bestellnummer per line (set via "Abgleichen").
  split(group, productsById) {
    const orderable: AggregatedLine[] = [];
    const blocked: OrderableSplit['blocked'] = [];
    for (const line of group.lines) {
      if (pulsaBestellnummerOf(line, productsById)) orderable.push(line);
      else blocked.push({ line, reason: 'Keine Pulsa-Bestellnummer' });
    }
    return { orderable, blocked };
  },
  async place({ group, supplier, productsById, pulsaByProductId, shippingAddress, standortLabel, orderable }) {
    const positionen = orderable.map((l) => ({
      bestellnummer: pulsaBestellnummerOf(l, productsById)!,
      bezeichnung: l.productName,
      einkaufspreis: (l.productId ? pulsaByProductId.get(l.productId)?.ekNet : null) ?? null,
      anzahl: l.totalQty,
    }));
    const auftragsnummer = `KITZ-${Date.now()}`;
    const xml = buildPulsaOrderXml({
      firmenname: 'KITZ Computer + Office GmbH',
      kundennummer: supplier?.customerNumber ?? '',
      auftragsnummer,
      auftragsdatum: formatPulsaDate(new Date()),
      // Liefer- + Rechnungsadresse = the Standort chosen in the confirm modal.
      lieferadresse: shippingAddress,
      rechnungsadresse: shippingAddress,
      positionen,
    });
    const { to } = await sendSupplierOrderXml({
      supplierId: group.supplierId!,
      xml,
      // Pulsa (PV) wants the filename to carry the order number, the subject
      // to always begin "PULSA Bestellung …"; the sender is fixed server-side.
      filename: `Bestellung-${auftragsnummer}.xml`,
      subject: `PULSA Bestellung ${auftragsnummer}`,
      note: `Lieferung ${standortLabel}`,
    });
    return `Pulsa-XML an ${to} · Lieferung ${standortLabel}`;
  },
};

const REGISTRY: Record<Exclude<OrderMethod, 'manual'>, OrderStrategy> = {
  api: apiStrategy,
  email: emailStrategy,
  email_xml: emailXmlStrategy,
};

// The strategy for an order method, or null for 'manual' (inline flow).
export function strategyForMethod(method: OrderMethod): OrderStrategy | null {
  return method === 'manual' ? null : REGISTRY[method];
}
