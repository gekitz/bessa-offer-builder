// Beschaffungs-Domänentypen (Hardware-Bestellanfragen).
//
// Spiegelt supabase/migrations/20260821120000_create_procurement.sql in
// der camelCase + ISO-String-Konvention der App. snake_case ↔ camelCase
// Mapping passiert in der API-Schicht (api/procurementApi.ts).

export type OrderRequestStatus = 'open' | 'ordered' | 'received' | 'cancelled';
export type PurchaseOrderStatus = 'ordered' | 'received' | 'cancelled';

// How an order reaches a supplier:
//   api    — supplier REST API (Jarltech, binding)
//   email  — order e-mail to suppliers.orderEmail (Orderman)
//   manual — recorded internally only; a human places it (RCH, Pulsa, …)
export type OrderMethod = 'api' | 'email' | 'manual';

// ─────────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  code: string;
  name: string;
  orderEmail: string | null;
  orderMethod: OrderMethod;
  notes: string | null;
  active: boolean;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierInput {
  code: string;
  name: string;
  orderEmail?: string | null;
  notes?: string | null;
  active?: boolean;
  sort?: number;
}

// ─────────────────────────────────────────────────────────────────────

// Ein bestellbares Produkt (aktive Zeile aus `products`) mit seinen
// Lieferanten-Verknüpfungen — Basis fürs Anlegen einer Anfrage.
export interface RequestableProduct {
  id: string;
  name: string;
  code: string | null;
  catalog: string;
  supplierId: string | null;      // bevorzugte Bezugsquelle
  altSupplierIds: string[];       // weitere mögliche Quellen (Doppelquelle)
  jarltechItemId: string | null;  // für Jarltech-Preisabruf
}

// ─────────────────────────────────────────────────────────────────────

export interface OrderRequest {
  id: string;
  productId: string | null;
  productName: string;
  productCode: string | null;
  supplierId: string | null;
  qty: number;
  note: string | null;
  status: OrderRequestStatus;
  unitPrice: number | null;
  customerId: string | null;
  customerName: string | null;
  offerId: string | null;
  purchaseOrderId: string | null;
  requestedBy: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Über Joins/Client-Dekoration befüllt
  _requesterName?: string;
  _supplierName?: string;
}

export interface OrderRequestInput {
  productId?: string | null;
  productName: string;
  productCode?: string | null;
  supplierId?: string | null;
  qty: number;
  note?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  offerId?: string | null;
  requestedBy?: string | null;
}

export interface OrderRequestFilters {
  status?: OrderRequestStatus[];
  supplierId?: string;
  requestedBy?: string;
  purchaseOrderId?: string;
}

// ─────────────────────────────────────────────────────────────────────

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  note: string | null;
  priceQuotes: PriceQuote[] | null;
  orderedBy: string | null;
  orderedAt: string;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Über Joins/Client-Dekoration befüllt
  _supplierName?: string;
  _requests?: OrderRequest[];
}

// Ein festgehaltener Preisvergleich (Doppelquelle): was hätte welcher
// Lieferant für dieses Produkt gekostet.
export interface PriceQuote {
  productId: string | null;
  productName: string;
  supplierId: string;
  unitPrice: number;
}

// Beim "Bestellen" pro Produktzeile gewählte Bezugsquelle + Stückpreis.
export interface OrderLineDecision {
  requestIds: string[];      // die Anfragen dieser Produktzeile
  supplierId: string;        // gewählter Lieferant
  unitPrice: number | null;  // gewählter Stückpreis (netto)
}
