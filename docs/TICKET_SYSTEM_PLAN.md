# Ticket-System & Kalender-Refactoring — Implementierungsplan

**Ziel:** Ticket-Management mit Reparaturscheinen, Terminen und einem zentralen Kalender der Urlaub, Schichten und Termine vereint.

---

## Übersicht Architektur

```
tickets (Fall/Anfrage)
  ├── appointments (Termine — im Kalender sichtbar)
  │     └── appointment_assignees (n Techniker pro Termin)
  └── repair_orders (Reparaturscheine — nach Termin vor Ort)
        ├── repair_order_entries (Zeiteintrag pro Techniker)
        └── repair_order_materials (Material aus Mesonic Artikelkatalog Type 4)

abteilungen (ergänzt: hourly_rate, travel_rate für Abrechnung)

Kalender (zentrale Ansicht):
  - Layer 1: appointments (lila)
  - Layer 2: leave_requests (rot) — bestehend
  - Layer 3: shifts (orange) — bestehend
  - Layer 4: bank_holidays_at (grün) — bestehend
```

---

## Teil 1: Datenbank-Migration

Erstelle eine neue Migration `supabase/migrations/20260512120000_create_tickets.sql`.

### 1.1 Tabelle `tickets`

```sql
CREATE TABLE tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT,
  -- Kategorisierung
  kind                TEXT NOT NULL DEFAULT 'support'
                      CHECK (kind IN ('support', 'installation', 'reparatur', 'wartung', 'beratung', 'intern')),
  priority            TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'waiting', 'closed', 'cancelled')),
  -- Pool-Zuweisung (IT, Kassen, Netzwerk)
  pool_abteilung_id   SMALLINT REFERENCES abteilungen(id),
  -- Zugewiesener Mitarbeiter (Hauptverantwortlicher)
  assigned_to         UUID REFERENCES employees(id),
  -- Kunde — Referenz auf Mesonic (Type 1)
  mesonic_customer_id TEXT,
  customer_name       TEXT,
  customer_phone      TEXT,
  customer_email      TEXT,
  customer_address    TEXT,
  -- Standort
  standort_id         SMALLINT REFERENCES standorte(id),
  -- Abrechnung: wenn true, werden billable rep_orders bei Close summiert
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Abschluss-Felder
  closed_at           TIMESTAMPTZ,
  closed_by           UUID REFERENCES employees(id),
  resolution_note     TEXT,
  -- Verknüpfung mit Angebot (optional)
  offer_id            UUID REFERENCES offers(id),
  -- Mesonic Beleg-Referenz nach Abrechnung
  mesonic_beleg_id    TEXT,
  -- Audit
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assigned ON tickets(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_tickets_customer ON tickets(mesonic_customer_id) WHERE mesonic_customer_id IS NOT NULL;
CREATE INDEX idx_tickets_pool ON tickets(pool_abteilung_id) WHERE pool_abteilung_id IS NOT NULL;
CREATE INDEX idx_tickets_created ON tickets(created_at DESC);

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
```

### 1.2 Tabelle `appointments`

Termine die im zentralen Kalender erscheinen. Können an ein Ticket hängen oder standalone sein (z.B. "Beratungstermin bei Kunde X").

```sql
CREATE TABLE appointments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Optional: Termin gehört zu einem Ticket
  ticket_id           UUID REFERENCES tickets(id) ON DELETE SET NULL,
  -- Kunde (denormalisiert für Kalender-Anzeige ohne Ticket-Join)
  mesonic_customer_id TEXT,
  customer_name       TEXT,
  -- Termin-Details
  title               TEXT NOT NULL,
  description         TEXT,
  kind                TEXT NOT NULL DEFAULT 'reparatur'
                      CHECK (kind IN ('installation', 'reparatur', 'wartung', 'beratung', 'abholung', 'lieferung', 'intern')),
  -- Zeitfenster
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  all_day             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Ort
  location            TEXT,
  -- Status
  status              TEXT NOT NULL DEFAULT 'geplant'
                      CHECK (status IN ('geplant', 'bestaetigt', 'in_arbeit', 'erledigt', 'abgesagt')),
  -- Standort (für Kalender-Filterung)
  standort_id         SMALLINT REFERENCES standorte(id),
  -- Notizen
  notes               TEXT,
  -- Audit
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_appointments_dates ON appointments(starts_at, ends_at);
CREATE INDEX idx_appointments_ticket ON appointments(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX idx_appointments_status ON appointments(status);

CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
```

### 1.3 Tabelle `appointment_assignees`

Mehrere Techniker pro Termin, einer davon ist Lead.

```sql
CREATE TABLE appointment_assignees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  role            TEXT NOT NULL DEFAULT 'techniker'
                  CHECK (role IN ('lead', 'techniker', 'lehrling')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (appointment_id, employee_id)
);

CREATE INDEX idx_appointment_assignees_employee ON appointment_assignees(employee_id);
CREATE INDEX idx_appointment_assignees_appointment ON appointment_assignees(appointment_id);
```

### 1.4 Tabelle `repair_orders`

Reparaturschein — entsteht nach einem Vor-Ort-Einsatz, wird vom Kunden unterschrieben.

```sql
CREATE TABLE repair_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Gehört immer zu einem Ticket
  ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- Optional: erstellt aus einem Termin
  appointment_id      UUID REFERENCES appointments(id) ON DELETE SET NULL,
  -- Laufnummer pro Ticket (1, 2, 3...) — für Anzeige "Rep.schein #3"
  seq_number          SMALLINT NOT NULL DEFAULT 1,
  -- Status-Flow
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'completed', 'signed', 'cancelled')),
  -- Arbeitsbeschreibung
  work_description    TEXT,
  -- GPS-basierte Anfahrtsnotiz ("Anfahrt wird nach GPS verrechnet")
  gps_travel_note     TEXT,
  -- Kundenunterschrift
  signature_data      TEXT,  -- base64 PNG aus SignaturePad
  signed_at           TIMESTAMPTZ,
  signed_by_name      TEXT,  -- Name des Unterzeichners (Kundenname)
  -- Wann wurde die Arbeit durchgeführt
  performed_at        DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Verrechenbar?
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  created_by          UUID REFERENCES employees(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_orders_ticket ON repair_orders(ticket_id);
CREATE INDEX idx_repair_orders_appointment ON repair_orders(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX idx_repair_orders_status ON repair_orders(status);

CREATE TRIGGER trg_repair_orders_updated_at
  BEFORE UPDATE ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- Auto-increment seq_number per ticket
CREATE OR REPLACE FUNCTION set_repair_order_seq()
RETURNS TRIGGER AS $$
BEGIN
  SELECT COALESCE(MAX(seq_number), 0) + 1 INTO NEW.seq_number
  FROM repair_orders WHERE ticket_id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_order_seq
  BEFORE INSERT ON repair_orders
  FOR EACH ROW EXECUTE FUNCTION set_repair_order_seq();
```

### 1.5 Tabelle `repair_order_entries`

Zeiteintrag pro Techniker pro Reparaturschein. Abrechnung läuft über Abteilungs-Stundensatz des Technikers.

```sql
CREATE TABLE repair_order_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id   UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  -- Welcher Techniker
  employee_id       UUID NOT NULL REFERENCES employees(id),
  -- Zeiterfassung in Minuten
  travel_minutes    INTEGER NOT NULL DEFAULT 0 CHECK (travel_minutes >= 0),
  work_minutes      INTEGER NOT NULL DEFAULT 0 CHECK (work_minutes >= 0),
  -- Optionale Notiz
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (repair_order_id, employee_id)
);

CREATE INDEX idx_repair_order_entries_repair ON repair_order_entries(repair_order_id);
CREATE INDEX idx_repair_order_entries_employee ON repair_order_entries(employee_id);
```

### 1.6 Tabelle `repair_order_materials`

Material aus Mesonic Artikelkatalog (Type 4). `bezeichnung` wird beim Hinzufügen aus Mesonic gecached — historisch korrekt auch wenn Mesonic-Artikel umbenannt wird.

```sql
CREATE TABLE repair_order_materials (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_order_id   UUID NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  -- Referenz auf Mesonic Artikel (Type 4, WebArtikelExport)
  mesonic_artikel_nr TEXT NOT NULL,
  -- Gecachte Bezeichnung zum Zeitpunkt der Auswahl
  bezeichnung       TEXT NOT NULL,
  -- Menge und Preis
  quantity          NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  -- Berechnetes Total (DB-seitig, kein Rechenfehler möglich)
  total             NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_repair_materials_repair ON repair_order_materials(repair_order_id);
CREATE INDEX idx_repair_materials_artikel ON repair_order_materials(mesonic_artikel_nr);
```

### 1.7 Ergänzung `abteilungen`: Stundensätze

Die bestehende `abteilungen`-Tabelle bekommt Stundensätze für Arbeit und Anfahrt.

```sql
ALTER TABLE abteilungen
  ADD COLUMN hourly_rate  NUMERIC(8,2) NOT NULL DEFAULT 0,
  ADD COLUMN travel_rate  NUMERIC(8,2) NOT NULL DEFAULT 0;

-- Seed mit bekannten Abteilungssätzen (Beispielwerte — Georg anpassen)
UPDATE abteilungen SET hourly_rate = 95.00, travel_rate = 75.00 WHERE name = 'IT';
UPDATE abteilungen SET hourly_rate = 95.00, travel_rate = 75.00 WHERE name = 'Kassen';
UPDATE abteilungen SET hourly_rate = 95.00, travel_rate = 75.00 WHERE name = 'Netzwerk';
UPDATE abteilungen SET hourly_rate = 85.00, travel_rate = 65.00 WHERE name = 'MFP';
```

### 1.8 Ticket-Kommentare / Verlauf

```sql
CREATE TABLE ticket_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- Typ: manueller Kommentar oder System-Event
  kind        TEXT NOT NULL DEFAULT 'comment'
              CHECK (kind IN ('comment', 'status_change', 'assignment', 'system')),
  body        TEXT,
  -- Bei status_change: alter und neuer Status
  metadata    JSONB,
  created_by  UUID REFERENCES employees(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX idx_ticket_comments_created ON ticket_comments(created_at);
```

### 1.9 RLS Policies

```sql
ALTER TABLE tickets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_assignees  ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments        ENABLE ROW LEVEL SECURITY;

-- Permissive für jetzt (wie alle anderen Tabellen). Tighten later.
CREATE POLICY all_access ON tickets                FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON appointments           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON appointment_assignees  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_orders          FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_order_entries   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON repair_order_materials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY all_access ON ticket_comments        FOR ALL USING (true) WITH CHECK (true);
```

---

## Teil 2: Navigation — "Urlaub" → "Kalender" + "Tickets"

### 2.1 AppShell NAV_ITEMS aktualisieren

**Datei:** `src/components/AppShell.jsx`

Ändere NAV_ITEMS:

```js
import { Calendar, FileText, Users, Wrench } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'angebote', label: 'Angebote', icon: FileText },
  { id: 'crm',      label: 'CRM',      icon: Users },
  { id: 'kalender', label: 'Kalender', icon: Calendar },
  { id: 'tickets',  label: 'Tickets',  icon: Wrench },
];
```

### 2.2 Section-Routing in OfferBuilderPage

**Datei:** `src/features/offers/pages/OfferBuilderPage.jsx`

Ergänze die section map:
- `kalender` → lazy-load `CalendarPage` (refactored aus VacationPage)
- `tickets` → lazy-load `TicketsPage`

```js
const CalendarPage = React.lazy(() => import('../../calendar/pages/CalendarPage'));
const TicketsPage = React.lazy(() => import('../../tickets/pages/TicketsPage'));
```

Die bisherige `urlaub`-Section redirectet intern auf `kalender`.

---

## Teil 3: Kalender-Refactoring

### 3.1 Neues Feature-Verzeichnis

```
src/features/calendar/
  ├── pages/
  │   └── CalendarPage.tsx        ← Haupt-Seite (ersetzt VacationPage)
  ├── components/
  │   ├── UnifiedCalendar.tsx     ← Monats/Wochen/Tag-Ansicht mit allen Layern
  │   ├── TeamView.tsx            ← Zeilen=Mitarbeiter, Spalten=Tage
  │   ├── DayDetailModal.tsx      ← Erweitert: zeigt Termine + Urlaub + Schichten
  │   └── AppointmentForm.tsx     ← Termin erstellen/bearbeiten
  ├── hooks/
  │   └── useCalendarEvents.ts    ← Unified query über alle Event-Quellen
  └── api/
      └── calendarApi.ts          ← CRUD für appointments + appointment_assignees
```

### 3.2 CalendarPage — Tab-Struktur

CalendarPage ersetzt VacationPage und enthält folgende Tabs:

| Tab | Inhalt | Zugang |
|-----|--------|--------|
| Kalender | UnifiedCalendar (Monat/Woche/Tag/Team) | Alle |
| Mein Urlaub | LeaveRequestForm + LeaveRequestsList | Alle |
| Meine Schichten | MyShiftsPanel (bestehend) | Alle |
| Genehmigungen | DecisionDialog + pending list | Nur Approver |
| Verwaltung | ShiftAdminPanel + BalanceTable + iCal | Nur Admin/Approver |

Die bestehenden Vacation- und Shift-Komponenten werden wiederverwendet, nicht neu geschrieben.

### 3.3 useCalendarEvents Hook

```typescript
// src/features/calendar/hooks/useCalendarEvents.ts
interface CalendarEvent {
  id: string;
  type: 'appointment' | 'leave' | 'shift' | 'holiday';
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  color: string;        // Layer-Farbe
  employeeIds: string[];
  metadata: Record<string, any>;  // typ-spezifische Daten
}

function useCalendarEvents(year: number, month: number): {
  events: CalendarEvent[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}
```

Fetcht parallel aus 4 Quellen:

1. `appointments` + `appointment_assignees` (WHERE starts_at/ends_at im Monat)
2. `leave_requests` (WHERE status IN ('approved','pending') AND Datumsüberlapp)
3. `shifts` (WHERE shift_date im Monat AND employee_id IS NOT NULL)
4. `bank_holidays_at` (WHERE holiday_date im Monat)

Normalisiert alles auf `CalendarEvent[]`.

### 3.4 Filter-Toggles

Der Kalender hat Toggle-Buttons pro Layer:
- 🟣 Termine (appointments) — default: ein
- 🔴 Urlaub/Kranken (leave) — default: ein
- 🟠 Schichten (shifts) — default: ein
- 🟢 Feiertage (holidays) — default: ein

Zustand in localStorage persistiert.

### 3.5 Team-Ansicht

Neue Ansicht neben Monat/Woche/Tag:
- Zeilen = aktive Mitarbeiter (aus `employees`)
- Spalten = Tage der aktuellen Woche/des Monats
- Zellen zeigen farbig: Termin (lila), Urlaub (rot), Schicht (orange), frei (grau)
- Klick auf Zelle öffnet DayDetailModal

Ideal für die morgendliche Planung: "Wer ist wann wo?"

---

## Teil 4: Ticket-Feature

### 4.1 Feature-Verzeichnis

```
src/features/tickets/
  ├── types.ts
  ├── pages/
  │   └── TicketsPage.tsx         ← Hauptseite mit Board/List View
  ├── components/
  │   ├── TicketList.tsx          ← Filterbarer Ticket-List (nach Status, Pool, Assignee)
  │   ├── TicketBoard.tsx         ← Kanban-Board (open | in_progress | waiting | closed)
  │   ├── TicketDetail.tsx        ← Detail-Ansicht eines Tickets
  │   ├── TicketForm.tsx          ← Erstellen/Bearbeiten
  │   ├── TicketComments.tsx      ← Kommentar-Thread + Status-Historie
  │   ├── RepairOrderCard.tsx     ← Kompakte Ansicht eines Rep.scheins
  │   ├── RepairOrderForm.tsx     ← Rep.schein erstellen/bearbeiten
  │   ├── RepairOrderDetail.tsx   ← Vollansicht mit Einträgen + Material
  │   ├── TimeEntryForm.tsx       ← Zeiteintrag (travel_min, work_min) pro Techniker
  │   ├── MaterialPicker.tsx      ← Artikel aus Mesonic suchen + hinzufügen
  │   ├── SignatureCapture.tsx    ← Kundenunterschrift (reuse SignaturePad aus offers)
  │   └── TicketBillingPreview.tsx← Vor-Abschluss: Zusammenfassung aller Kosten
  ├── hooks/
  │   ├── useTickets.ts           ← Liste + Filter + Suche
  │   ├── useTicketDetail.ts      ← Einzelnes Ticket mit Relationen
  │   └── useMyTicketCount.ts     ← Badge-Count für Nav
  └── api/
      └── ticketApi.ts            ← CRUD für tickets, repair_orders, entries, materials, comments
```

### 4.2 Types

```typescript
// src/features/tickets/types.ts

export type TicketKind = 'support' | 'installation' | 'reparatur' | 'wartung' | 'beratung' | 'intern';
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'closed' | 'cancelled';
export type RepairOrderStatus = 'draft' | 'completed' | 'signed' | 'cancelled';
export type AppointmentKind = 'installation' | 'reparatur' | 'wartung' | 'beratung' | 'abholung' | 'lieferung' | 'intern';
export type AppointmentStatus = 'geplant' | 'bestaetigt' | 'in_arbeit' | 'erledigt' | 'abgesagt';

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  kind: TicketKind;
  priority: TicketPriority;
  status: TicketStatus;
  poolAbteilungId?: number;
  assignedTo?: string;
  mesonicCustomerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  standortId?: number;
  billable: boolean;
  closedAt?: string;
  closedBy?: string;
  resolutionNote?: string;
  offerId?: string;
  mesonicBelegId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  _assigneeName?: string;
  _repairOrderCount?: number;
  _appointmentCount?: number;
}

export interface Appointment {
  id: string;
  ticketId?: string;
  mesonicCustomerId?: string;
  customerName?: string;
  title: string;
  description?: string;
  kind: AppointmentKind;
  startsAt: string;  // ISO
  endsAt: string;    // ISO
  allDay: boolean;
  location?: string;
  status: AppointmentStatus;
  standortId?: number;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  // Populated by join
  assignees?: AppointmentAssignee[];
}

export interface AppointmentAssignee {
  id: string;
  appointmentId: string;
  employeeId: string;
  role: 'lead' | 'techniker' | 'lehrling';
  // Populated by join
  _employeeName?: string;
}

export interface RepairOrder {
  id: string;
  ticketId: string;
  appointmentId?: string;
  seqNumber: number;
  status: RepairOrderStatus;
  workDescription?: string;
  gpsTravelNote?: string;
  signatureData?: string;
  signedAt?: string;
  signedByName?: string;
  performedAt: string;  // ISO date
  billable: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  // Populated by joins
  entries?: RepairOrderEntry[];
  materials?: RepairOrderMaterial[];
}

export interface RepairOrderEntry {
  id: string;
  repairOrderId: string;
  employeeId: string;
  travelMinutes: number;
  workMinutes: number;
  note?: string;
  // Populated by join
  _employeeName?: string;
  _abteilungName?: string;
  _hourlyRate?: number;
  _travelRate?: number;
}

export interface RepairOrderMaterial {
  id: string;
  repairOrderId: string;
  mesonicArtikelNr: string;
  bezeichnung: string;
  quantity: number;
  unitPrice: number;
  total: number;
}
```

### 4.3 API Layer

```typescript
// src/features/tickets/api/ticketApi.ts
// Alle Funktionen verwenden Supabase Client aus lib/supabase.ts

// --- Tickets ---
export async function listTickets(filters?: { status?, assignedTo?, pool?, search? }): Promise<Ticket[]>
export async function getTicket(id: string): Promise<Ticket>  // inkl. repair_orders, appointments
export async function createTicket(data: Partial<Ticket>): Promise<Ticket>
export async function updateTicket(id: string, data: Partial<Ticket>): Promise<Ticket>
export async function closeTicket(id: string, resolutionNote?: string): Promise<Ticket>

// --- Appointments ---
export async function listAppointments(range: { from: string, to: string }): Promise<Appointment[]>
export async function createAppointment(data: Partial<Appointment>, assigneeIds: string[]): Promise<Appointment>
export async function updateAppointment(id: string, data: Partial<Appointment>): Promise<Appointment>
export async function deleteAppointment(id: string): Promise<void>

// --- Repair Orders ---
export async function listRepairOrders(ticketId: string): Promise<RepairOrder[]>
export async function createRepairOrder(data: Partial<RepairOrder>): Promise<RepairOrder>
export async function updateRepairOrder(id: string, data: Partial<RepairOrder>): Promise<RepairOrder>
export async function signRepairOrder(id: string, signatureData: string, signedByName: string): Promise<RepairOrder>

// --- Entries ---
export async function upsertEntry(repairOrderId: string, entry: Partial<RepairOrderEntry>): Promise<RepairOrderEntry>
export async function deleteEntry(id: string): Promise<void>

// --- Materials ---
export async function addMaterial(repairOrderId: string, material: Partial<RepairOrderMaterial>): Promise<RepairOrderMaterial>
export async function updateMaterial(id: string, data: Partial<RepairOrderMaterial>): Promise<RepairOrderMaterial>
export async function removeMaterial(id: string): Promise<void>

// --- Comments ---
export async function listComments(ticketId: string): Promise<TicketComment[]>
export async function addComment(ticketId: string, body: string): Promise<TicketComment>

// --- Billing ---
export async function calculateTicketBilling(ticketId: string): Promise<BillingSummary>
// BillingSummary: { laborTotal, travelTotal, materialTotal, grandTotal, positions[] }
```

### 4.4 MaterialPicker Komponente

Sucht Mesonic-Artikel (Type 4) über die bestehende `searchArticles()` aus `mesonicApi.js`. Zeigt Ergebnisse als auswählbare Liste. Bei Auswahl wird `mesonic_artikel_nr` und `bezeichnung` gespeichert.

```
MaterialPicker
  ├── Suchfeld (debounced, min 2 Zeichen)
  ├── Ergebnisliste aus Mesonic
  │     └── Klick → Menge + Preis eingeben → speichern
  └── Bereits hinzugefügte Materialien (editierbar)
```

Da WebPreisExport noch nicht verfügbar ist (wartet auf Heri), wird der Preis vorerst manuell eingegeben. Sobald das Preis-Template steht, kann der Preis automatisch vorausgefüllt werden.

### 4.5 TicketsPage — Hauptansicht

Zwei View-Modi (Toggle):
1. **Liste** — Filterbarer Table mit Status-Tabs (Offen | In Arbeit | Wartend | Geschlossen)
2. **Board** — Kanban-Spalten (wie Angebote-Pipeline)

Filter:
- Status (multi-select)
- Pool/Abteilung
- Zugewiesen an (Dropdown aus employees)
- Kunde (Mesonic-Suche)
- Priorität
- Freitext-Suche (title, description, customer_name)

### 4.6 TicketDetail — Detail-Ansicht

```
TicketDetail
  ├── Header: Titel, Status-Badge, Priorität, Kunde, Zugewiesen
  ├── Tab: Übersicht
  │     ├── Beschreibung
  │     ├── Kundeninfo (mit Link zu CRM)
  │     └── Verknüpftes Angebot
  ├── Tab: Termine
  │     ├── Liste der Appointments
  │     └── Button: "Termin planen" → AppointmentForm
  ├── Tab: Reparaturscheine
  │     ├── Liste der RepairOrders als Cards
  │     ├── Button: "Neuer Rep.schein"
  │     └── Klick → RepairOrderDetail
  ├── Tab: Verlauf
  │     └── TicketComments (Kommentare + System-Events)
  └── Footer-Actions:
        ├── Status ändern (Dropdown)
        ├── Zuweisen (Dropdown)
        └── Ticket schließen → TicketBillingPreview
```

### 4.7 RepairOrderForm — Reparaturschein erstellen

Ablauf:
1. Arbeitsbeschreibung eingeben
2. Techniker hinzufügen (aus employees, vorausgefüllt mit Termin-Assignees)
3. Pro Techniker: Arbeitszeit + Anfahrtszeit in Minuten
4. Material hinzufügen über MaterialPicker
5. GPS-Notiz ("Anfahrt wird nach GPS verrechnet")
6. Vorschau der Kosten (Stunden × Abteilungs-Rate + Material)
7. Kunde unterschreiben lassen → SignatureCapture
8. Speichern → Status: signed

### 4.8 TicketBillingPreview — Abschluss

Wird angezeigt wenn ein Ticket geschlossen wird. Summiert alle billable repair_orders:

```
┌─────────────────────────────────────────┐
│ Ticket #1234 — Abschluss                │
│                                         │
│ Rep.schein #1 (12.05.2026)              │
│   Huber H.  2h Arbeit × €95 = €190     │
│   Huber H.  30min Anfahrt × €75 = €37  │
│   Sunmi V2  2 Stk × €450 = €900        │
│                                   €1127 │
│                                         │
│ Rep.schein #2 (14.05.2026)              │
│   Weber K.  1.5h × €95 = €142.50       │
│   Kabel Cat6 10m × €2.50 = €25         │
│                                 €167.50 │
│                                         │
│ ─────────────────────────────────────── │
│ Gesamt:                       €1294.50  │
│                                         │
│ [ → Mesonic Beleg erstellen ]           │
└─────────────────────────────────────────┘
```

Der "Mesonic Beleg erstellen" Button ist vorerst disabled (wartet auf funktionierende Mesonic Import API). Die Zusammenfassung wird aber schon korrekt berechnet und angezeigt.

---

## Teil 5: Implementierungsreihenfolge

### Sprint 1: Datenbank + API (2-3 Tage)

1. Migration `20260512120000_create_tickets.sql` schreiben und deployen
2. `src/features/tickets/types.ts` erstellen
3. `src/features/tickets/api/ticketApi.ts` implementieren
4. `src/features/calendar/api/calendarApi.ts` implementieren
5. Tests für API-Funktionen

### Sprint 2: Navigation + Kalender-Refactoring (2-3 Tage)

1. AppShell NAV_ITEMS ändern: `urlaub` → `kalender`, `tickets` hinzufügen
2. `CalendarPage` erstellen (Wrapper um bestehende Vacation-Tabs + neuer Kalender-Tab)
3. `useCalendarEvents` Hook implementieren
4. `UnifiedCalendar` bauen (erweitert LeaveCalendar um Appointment-Layer)
5. Bestehende Vacation/Shift-Funktionalität verifizieren — nichts darf brechen
6. Filter-Toggles pro Layer

### Sprint 3: Ticket-UI (3-4 Tage)

1. `TicketsPage` mit Liste und Board-View
2. `TicketForm` (erstellen/bearbeiten)
3. `TicketDetail` mit Tabs
4. `TicketComments` Timeline
5. Badge-Count im Nav (`useMyTicketCount`)

### Sprint 4: Reparaturscheine (3-4 Tage)

1. `RepairOrderForm` mit Techniker-Einträgen
2. `TimeEntryForm`
3. `MaterialPicker` (Mesonic-Artikelsuche)
4. `SignatureCapture` (reuse von offers/SignaturePad)
5. `RepairOrderDetail` Ansicht
6. `TicketBillingPreview` Abschluss-Zusammenfassung

### Sprint 5: Termine + Kalender-Integration (2-3 Tage)

1. `AppointmentForm` (im Ticket-Kontext + standalone)
2. Termine im UnifiedCalendar anzeigen
3. Team-Ansicht (`TeamView`)
4. DayDetailModal erweitern (Termine anzeigen + bearbeiten)
5. Termin → Rep.schein Vorausfüllung
6. iCal-Feed erweitern um Termine

### Sprint 6: Polish + Tests (2 Tage)

1. Mobile-Responsiveness für alle neuen Komponenten
2. Keyboard-Shortcuts / Accessibility
3. Error-Handling und Loading-States
4. Test-Suite für neue Komponenten

---

## Teil 6: Integration mit bestehenden Systemen

### 6.1 Mesonic-Integration

| Funktion | Mesonic-Endpoint | Status |
|----------|-----------------|--------|
| Kunde auf Ticket | Type 1 Export (WebKontenExport) | ✅ funktioniert |
| Material suchen | Type 4 Export (WebArtikelExport) | ✅ funktioniert |
| Material-Preis | Type 5 Export (WebPreisExport) | ⛔ wartet auf Heri |
| Beleg erstellen | Type 30 Import (WebBelegImport) | ⛔ wartet auf Heri |

### 6.2 Bestehende Tabellen die genutzt werden

- `employees` — Techniker-Zuordnung, Zeiten-Erfassung
- `employee_roles` — Abteilungs-Zuordnung → Stundensatz
- `abteilungen` — Stundensätze (hourly_rate, travel_rate)
- `standorte` — Standort-Filterung
- `offers` — optionale Ticket↔Offer-Verknüpfung
- `leave_requests` — Kalender-Layer
- `shifts` — Kalender-Layer
- `bank_holidays_at` — Kalender-Layer

### 6.3 CRM-Verknüpfung

Aus dem CRM (CustomerDetail) soll ein Button "Ticket erstellen" verfügbar sein der den Kunden direkt ins Ticket überträgt. Umgekehrt zeigt das Ticket die Kundendaten und verlinkt zurück zum CRM.

---

## Offene Fragen für Georg

1. **Stundensätze:** Die Beispielwerte (€95/€75) stimmen die? Bitte anpassen in der Migration.
2. **Ticket-Nummern:** Sollen Tickets eine fortlaufende Nummer bekommen (T-0001, T-0002) oder reicht die UUID?
3. **Email-Benachrichtigungen:** Soll der Kunde per Email über Ticket-Updates informiert werden?
4. **Anhänge:** Sollen Fotos/Dokumente an Tickets oder Reparaturscheine angehängt werden können?
5. **Reparaturschein-PDF:** Soll ein druckbarer PDF-Reparaturschein generiert werden (mit Unterschrift, Zeiten, Material)?
