# KITZ Workspace — Project Plan & Implementation Roadmap

**Last updated:** 11 May 2026 | **Version:** 2.0

---

## Project Overview

The **KITZ Workspace** (formerly bessa-offer-builder) is an internal business platform for KITZ Computer + Office GmbH, serving their Klagenfurt and Wolfsberg locations. It integrates offer management, CRM, vacation/leave management, shift planning, and billing into a single React app connected to **Mesonic WinLine ERP** via MDP WebServices.

### Tech Stack

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3.4 + TypeScript (new features)
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Realtime, Storage)
- **ERP Integration:** Mesonic WinLine MDP WebServices (HTTP/XML, session-based)
- **Auth:** Microsoft Entra ID SSO via Supabase Azure provider
- **Payments:** Stripe (checkout, subscriptions, invoicing)
- **Email:** Resend API
- **PDF:** @react-pdf/renderer (client-side)
- **Routing:** HashRouter with section-based deep linking
- **Future:** Electron for desktop, Starface REST API for CTI

### Architecture

```
React Frontend ─┬─ Supabase Edge Function (Mesonic Proxy) ─── WinLine MDP WebServices
                ├─ Supabase PostgreSQL (offers, workforce, shifts, tickets)
                ├─ Supabase Storage (PDFs, attachments)
                ├─ Supabase Realtime (live updates)
                └─ Stripe API (billing, subscriptions)
```

### Navigation Structure

```
KITZ Workspace
├── Angebote (offers list + builder)
├── CRM (customer search, detail, create/edit)
└── Urlaub (leave requests, calendar, shifts)
```

Mesonic API Type codes: **1**=Customers, **4**=Articles, **5**=Prices, **7**=Contacts, **30**=Belege (invoices/orders).

---

## Phase 1: Authentication & Mesonic Proxy ✅

**Duration:** 2 weeks | **Status:** Complete

### Week 1: Microsoft SSO & User Profiles ✅

| Task | Status | Notes |
|------|--------|-------|
| Supabase migration: user_profiles table | ✅ Done | mesonic_rep_id, role, pools |
| Database trigger: handle_new_user() | ✅ Done | Creates profile on first SSO login |
| RLS policies | ✅ Done | Permissive read/write, admin in app layer |
| AuthProvider context | ✅ Done | Session management, profile fetch |
| LoginPage + ProtectedRoute | ✅ Done | Microsoft SSO, German UI |
| AdminUserMapping component | ✅ Done | Map users to Mesonic rep IDs |
| Auto-match SSO email to TEAM | ✅ Done | Dual email format support |

### Week 2: Mesonic Proxy Edge Function ✅

| Task | Status | Notes |
|------|--------|-------|
| Edge Function: mesonic-proxy | ✅ Done | TypeScript, Deno, --no-verify-jwt |
| Session management + keepalive + recovery | ✅ Done | 4-min TTL, auto-relogin |
| EXIM forwarding: export, export_raw, import, ping, import_debug | ✅ Done | import verified working 2026-07-22 (form-field `data` + envelope + permission) |
| XML parser → JSON records | ✅ Done | German field names from Mesonic |
| Frontend client: mesonicApi.js | ✅ Done | Retry on WORKER_LIMIT (3x) |
| WHERE queries (LIKE with %%) | ✅ Done | Double %% for Mesonic LIKE; Key param built without URLSearchParams encoding |
| ⚠️ Wildcard/Range/Liste not supported | Won't fix | Use WHERE queries instead |

**Key learnings:**
- Mesonic returns German field names (Name, Strasse, Ort), not T055_C003 IDs → flexible field accessor `F.name(record)` pattern
- Import endpoint `/ewlservice/import` — ✅ **WORKING as of 2026-07-22** (Type 1 WebKontenImport, verified with a live create → account 238563). Four things had to line up: (1) POST body must be the full `<MESOWebService TemplateType="1" Template="WebKontenImport">…</MESOWebService>` envelope; (2) the XML must be sent as a **`data` form field** (`application/x-www-form-urlencoded`), NOT a raw `text/xml` body — a raw body returns plain-text "Missing Parameter"; (3) the API user `CRM_API` needs **(2) bearbeiten** permission on the template (read-only → 30s hang); (4) fields must follow the XSD `xs:sequence` order. `Kontonummer=+` auto-assigns the next free number in the debtor range.
- `WebPreisExport` template does not exist → **needs Mesonic technician to create**
- Large WHERE result sets (all articles) cause Edge Function timeout → use targeted searches only

---

## Phase 2: Customer & Article Catalog

**Duration:** 3 weeks | **Depends on:** Phase 1

### Week 3: Customer Management & Layout ✅

| Task | Status | Notes |
|------|--------|-------|
| AppShell: responsive sidebar + mobile bottom tab bar | ✅ Done | Desktop sidebar, mobile bottom nav, collapsible |
| Angebote section: list + builder views | ✅ Done | Section-based navigation |
| CRM customer search (WHERE with %%) | ✅ Done | Debounced, min 2 chars |
| Customer list + detail + create + edit | ✅ Done | CrmPage with view state, CustomerForm component |
| CustomerPicker: link Mesonic customer to offer | ✅ Done | Auto-fills fields + mesonicId badge |
| Store mesonic_customer_id on offers | ✅ Done | Migration 20260410 |
| Mobile responsive fix | ✅ Done | Bottom tab bar, responsive paddings, safe-area-inset |
| Mesonic import response parsing | ✅ Done | Detects OverallSuccess=false in XML |

### Week 4: Article Catalog ⏸️ Blocked

| Task | Status | Notes |
|------|--------|-------|
| Article export tested (Type 4, WebArtikelExport) | ✅ Done | Works for single + WHERE search; returns: Artikelnummer, Bezeichnung, Artikelgruppe, Gewicht |
| Article search in test page (#test) | ✅ Done | Tests 11-16, interactive Article Explorer |
| Price export (Type 5, WebPreisExport) | ⛔ Blocked | Template does not exist — needs Mesonic technician |
| bessa articles in Mesonic | ⛔ Blocked | Articles not yet correctly entered in WinLine |
| Article list view in CRM | Deferred | Waiting for correct article data |
| Replace hardcoded KASSA/HARDWARE arrays | Deferred | Waiting for correct article data + price export |
| Price calculation from Mesonic tiers | Deferred | Waiting for price export template |

**Blockers:** Email sent to Mesonic technician (Heri Scheiber, sh@kitz.co.at) requesting:
1. WebPreisExport template creation
2. WebKontenImport endpoint investigation (hangs on POST)
3. Confirmation of WebArtikelExport field completeness

### Week 5: Team Data Migration

| Task | Status | Notes |
|------|--------|-------|
| Replace hardcoded TEAM array | Pending | Now possible via `employees` table (workforce schema) |
| Update offer PDF with profile data | Pending | Creator info from employees/user_profiles |
| Customer → Offer end-to-end flow | Pending | Integration testing |

---

## Phase 3: Belege (Documents/Invoices)

**Duration:** 3 weeks | **Depends on:** Phase 2 + Mesonic Import working

### Week 6-7: Beleg Reading & Creation

| Task | Status | Notes |
|------|--------|-------|
| Fetch Belege from Mesonic (Type 30) | Pending | Requires working export |
| Beleg list + detail view | Pending | |
| Customer → Belege tab | Pending | |
| Create offer Beleg in Mesonic | ⛔ Blocked | Requires working import endpoint |
| Offer → Order → Invoice flow | ⛔ Blocked | Requires working import endpoint |

### Week 8: Beleg Polish

| Task | Status | Notes |
|------|--------|-------|
| Beleg number formatting, tax handling | Pending | |
| Beleg duplication, search | Pending | |
| Error handling, integration testing | Pending | |

**Analysis complete:** PDF-to-Mesonic storage options documented in `docs/PDF_TO_MESONIC_ANALYSIS.md`. Short-term: Supabase Storage + mesonic_customer_id (implemented). Long-term: Beleg import once articles are ready.

---

## Phase 4: Vacation & Leave Management ✅ NEW

**Duration:** 2 weeks | **Status:** Complete

### Database Schema (migration 20260504)

Supabase tables: `employees`, `employee_roles`, `leave_types`, `leave_requests`, `leave_balances`, `leave_request_decisions`, `substitutes`, `workforce_audit_log`. All with RLS and audit trails.

### Implementation

| Task | Status | Notes |
|------|--------|-------|
| Workforce DB schema (employees, roles, leave types, balances) | ✅ Done | 20260504 migration, RBAC support |
| VacationPage: main UI with tabs | ✅ Done | Lazy-loaded from AppShell |
| LeaveRequestForm: create/edit with validation | ✅ Done | Half-day support, attachments |
| LeaveRequestsList: filterable with status tabs | ✅ Done | Decision dialog for approvers |
| LeaveCalendar: month view with drag-to-range | ✅ Done | DayDetailModal for who's on leave |
| BalancePanel + EmployeeBalanceTable | ✅ Done | Entitlement, used, remaining per type |
| DecisionDialog: approve/reject with notes | ✅ Done | Approver-only interface |
| CalendarSubscriptionModal: iCal feed | ✅ Done | Per-employee token auth |
| 11 validation rules engine | ✅ Done | Entitlement, lead time, blackout, bridge days, coverage, etc. |
| Permissions (RBAC) | ✅ Done | isApprover() detection |
| useApproverPendingCount hook | ✅ Done | Badge in nav sidebar |
| Leave attachment upload (Krankmeldung) | ✅ Done | Supabase Storage |
| Comprehensive test suite | ✅ Done | 9 component + 9 rule + utility tests |

---

## Phase 5: Shift Management ✅ NEW

**Duration:** 1 week | **Status:** Complete

### Database Schema (migration 20260508)

Tables: `shift_slot_kinds`, `bank_holidays_at`, `shift_roster`, `shifts`, `shift_swaps`. Austrian holidays 2026-2027 seeded.

### Implementation

| Task | Status | Notes |
|------|--------|-------|
| Shift DB schema + seed data | ✅ Done | Slot kinds (Fri PM, Sat, Sun, Holiday) |
| MyShiftsPanel: upcoming ~6 shifts | ✅ Done | Employee view |
| ShiftAdminPanel: create slots, assign, manage | ✅ Done | Approver interface |
| ShiftDetailModal + ShiftSwapForm | ✅ Done | Swap request flow |
| Austrian bank holidays 2026-2027 | ✅ Done | Seeded in migration |
| Test suite | ✅ Done | 4 component tests |

---

## Phase 6: Stripe Billing Integration 🔧 In Progress NEW

**Duration:** 2 weeks | **Depends on:** Offer builder

### Database Schema (migration 20260423)

New columns on `offers`: `service_start_date`, `plan_chosen` (standard/ratenzahlung/miete), `stripe_customer_id`, `stripe_checkout_id`, `stripe_invoice_ids`, `stripe_subscription_ids`, `stripe_schedule_id`, `payment_status`, `accepted_at`. Audit table: `offer_payment_events`.

### Implementation

| Task | Status | Notes |
|------|--------|-------|
| Schema: Stripe columns + payment event audit | ✅ Done | Immutable event log |
| AppShell billing toggle (admin only: kg@kitz.co.at) | ✅ Done | localStorage gated |
| Auto-save offer + share code when billing enabled | ✅ Done | QR code generation |
| PDF: accept QR + service start date | ✅ Done | Conditional rendering |
| Stripe Checkout integration | Pending | Create checkout session from offer |
| Stripe Webhook handler | Pending | Edge Function for payment events |
| Subscription management | Pending | For monthly plans (ratenzahlung/miete) |
| Payment status UI in offer list | Pending | Badge + filter |

---

## Phase 7: Ticket Management

**Duration:** 3 weeks | **Depends on:** Phase 1

### Week 9-11: Tickets (unchanged from v1.2)

| Task | Status | Notes |
|------|--------|-------|
| Ticket CRUD + pools | Pending | Schema, list, create, detail |
| Communication + attachments | Pending | Message threads, email notifications |
| Ticket → Invoice | Pending | Time entries → Mesonic Beleg |

---

## Phase 8: Contacts & Dashboard

**Duration:** 2 weeks | **Depends on:** Phase 2 + Phase 3

| Task | Status | Notes |
|------|--------|-------|
| Contact management (Type 7) | Pending | Linked to customers |
| Activity timeline per customer | Pending | Aggregated view |
| CRM Dashboard with KPIs | Pending | Pipeline, tickets, revenue |

---

## Phase 9: Refactoring & Hardening

**Duration:** 2 weeks | **Depends on:** All previous phases

| Task | Status | Notes |
|------|--------|-------|
| Split App.jsx monolith | Pending | Now even larger with billing/vacation routing |
| React Router (proper, not hash-based) | Partially done | HashRouter + sectionRoute.ts in place |
| Role-based route access | Partially done | isApprover() exists for vacation |
| Pagination + virtual scrolling | Pending | |
| Audit logging | ✅ Done | workforce_audit_log + offer_payment_events |
| Push notifications | ✅ Done | push_subscriptions table |
| Security review | Pending | |

---

## Phase 10: Electron & Starface CTI (Future)

**Duration:** 3+ weeks | **Priority:** Low

| Task | Status | Notes |
|------|--------|-------|
| Electron shell + auto-updater | Pending | |
| Starface CTI: call events, customer lookup, click-to-call | Pending | |

---

## Open Blockers

| Blocker | Waiting on | Impact |
|---------|-----------|--------|
| ~~Mesonic Import endpoint hangs~~ | ✅ Resolved 2026-07-22 | Customer create works; Beleg import still to be verified (Type 30) |
| WebPreisExport template missing | Heri | Blocks: article pricing from Mesonic |
| bessa articles not in Mesonic | Internal data entry | Blocks: replacing hardcoded product arrays |

---

## Key Technical Decisions

### Authentication
Microsoft Entra ID SSO via Supabase Azure provider. Profile trigger creates user_profiles row on first login. RLS uses simple permissive policies; admin enforcement in app layer.

### Mesonic Integration Pattern
All Mesonic communication through Supabase Edge Function proxy. 30s timeout on imports (AbortController). Retry logic (3x) on WORKER_LIMIT. Session caching with 4-min TTL.

**Key learnings:**
- Mesonic returns German field names → flexible accessor `F.name(record)` pattern
- Double `%%` required for LIKE wildcards
- Import endpoint may require template activation by Mesonic technician
- Large result sets cause timeout → targeted searches only

### Data Ownership
- **Mesonic:** Customers, articles, prices, contacts, Belege (source of truth)
- **Supabase:** Offers, tickets, workforce (employees, leave, shifts), user profiles, audit logs, push subscriptions
- **Stripe:** Payment state, subscriptions, invoices (synced to Supabase via webhooks)

### Naming Conventions
Database columns and code in English. German in UI labels only.

### Feature Architecture
New features (vacation, shifts) use `src/features/{name}/` structure with dedicated api, types, components, rules, lib, pages, and tests. Older features (offers, CRM) still in `src/components/` and `src/App.jsx`.

---

## Environment & Configuration

| Key | Value |
|-----|-------|
| Supabase Project | `uouryrnyzicdociqberq` |
| Azure Tenant ID | `3e0069ff-cd50-4459-b2a9-ab509a14f433` |
| Frontend Domain | `bessa.kitz.co.at` |
| Admin Email | `kg@kitz.co.at` |
| Mesonic URL | `https://mesonic.kitz.co.at` |
| Mesonic User | `CRM_API` |
| Mesonic Company | `2KCO` |
| Mesonic Templates | WebKontenExport, WebKontenImport, WebArtikelExport, WebArtikelImport, WebBelegExport, WebBelegImport, WebKontakteExport |
| Missing Templates | WebPreisExport (requested) |
