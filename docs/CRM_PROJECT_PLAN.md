# BESSA CRM — Project Plan & Implementation Roadmap

**Last updated:** March 2026 | **Version:** 1.0

---

## Project Overview

Transform the existing **bessa-offer-builder** React app into a full-featured CRM integrated with **Mesonic WinLine ERP** via MDP WebServices. The system serves KITZ Computer + Office GmbH across their Klagenfurt and Wolfsberg locations.

### Tech Stack

- **Frontend:** React 18 + Vite 5 + Tailwind CSS 3.4
- **Backend:** Supabase (PostgreSQL, Auth, Edge Functions, Realtime)
- **ERP Integration:** Mesonic WinLine MDP WebServices (HTTP/XML, session-based)
- **Auth:** Microsoft Entra ID SSO via Supabase Azure provider
- **Email:** Resend API
- **PDF:** @react-pdf/renderer (client-side)
- **Future:** Electron for desktop, Starface REST API for CTI

### Architecture

```
React Frontend → Supabase Edge Function (Mesonic Proxy) → WinLine MDP WebServices
```

The proxy handles session management (login/keepalive/logout), forwards EXIM requests, and caches session tokens. Supabase-native tables handle tickets, user profiles, and other data that doesn't belong in Mesonic.

Mesonic API Type codes: **1**=Customers, **4**=Articles, **5**=Prices, **7**=Contacts, **30**=Belege (invoices/orders).

---

## Phase 1: Authentication & Mesonic Proxy

**Duration:** 2 weeks | **Priority:** Critical (blocks everything)

### Week 1: Microsoft SSO & User Profiles

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Supabase migration: user_profiles table with mesonic_rep_id, mesonic_rep_name, role, pools | 2h | ✅ Done | English column names only |
| Database trigger: handle_new_user() on auth.users INSERT, SECURITY DEFINER, SET search_path = public | 1h | ✅ Done | Creates profile on first SSO login |
| RLS policies: permissive read/insert/update for authenticated users, admin enforcement in app layer | 1h | ✅ Done | Avoids recursive policy bug |
| AuthProvider context (src/lib/auth.jsx): session management, profile fetch, SSO login/logout | 3h | ✅ Done | Separate useEffect for profile fetch to avoid Supabase deadlock |
| LoginPage component: Microsoft SSO button with branding | 1h | ✅ Done | German UI text |
| ProtectedRoute component: guards app, shows login/loading states | 1h | ✅ Done | |
| AdminUserMapping component: map users to Mesonic rep IDs, roles, pools | 3h | ✅ Done | Per-user save with optimistic UI |
| profileApi.js: listProfiles(), updateProfile() | 1h | ✅ Done | |
| Auto-match SSO email to TEAM array creator (dual email format support) | 1h | ✅ Done | Handles f.last@kitz vs lf@kitz formats |
| SSO setup documentation for IT admin (PDF) | 1h | ✅ Done | Concrete values filled in for KITZ |

### Week 2: Mesonic Proxy Edge Function

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Create Supabase Edge Function: supabase/functions/mesonic-proxy | 2h | ✅ Done | TypeScript, Deno runtime, deployed with --no-verify-jwt |
| Session management: login to WinLine with credentials from env vars | 2h | ✅ Done | Login returns `Session=<uuid>`, must strip prefix |
| Session keepalive: in-isolate caching with 4-min TTL | 1h | ✅ Done | Edge Functions are stateless; fresh login per cold start |
| Session error recovery: detect expired sessions and auto-relogin | 2h | ✅ Done | Checks for 001001/001002 and "session not found" text |
| EXIM request forwarding: export (parsed JSON + raw XML) and import | 3h | ✅ Done | Actions: export, export_raw, import, ping, debug |
| XML parser: Mesonic MESOWebService format → JSON records | 2h | ✅ Done | Template name used as record tag, error code extraction |
| Frontend client: src/lib/mesonicApi.js with typed helper functions | 2h | ✅ Done | searchCustomers, getCustomer, searchArticles, getBeleg, etc. |
| Auth guard: verify Supabase JWT via getUser() | 1h | ✅ Done | Reject unauthenticated requests |
| Test with real WinLine: single-key customer export (Type 1) | 2h | ✅ Done | Customer 29385 (Stadtgemeinde Althofen) reads correctly |
| Environment config: MESONIC_URL, MESONIC_USER, MESONIC_PASS, MESONIC_COMPANY | 1h | ✅ Done | Set as Supabase Edge Function secrets |
| ⚠️ BLOCKED: WHERE queries and wildcard Key=* return error 000161 | — | Blocked | Mesonic technician needs to enable Exportparameter on templates |
| ⚠️ BLOCKED: WebKontenListe/WebArtikelListe/WebBelegListe templates don't exist | — | Blocked | Mesonic technician needs to create slim list templates |

---

## Phase 2: Customer & Article Catalog

**Duration:** 3 weeks | **Depends on:** Phase 1 (Mesonic Proxy)

### Week 3: Customer Management

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Customer search via Mesonic EXIM (Type 1, Lesen with search params) | 3h | Pending | Search by name, number, city |
| Customer list view: paginated table with search bar | 3h | Pending | Debounced search, loading states |
| Customer detail view: master data, addresses, contact info | 3h | Pending | Read from Mesonic |
| Create new customer: form → Mesonic EXIM (Type 1, Schreiben) | 3h | Pending | Validation, required fields |
| Edit customer: update master data in Mesonic | 2h | Pending | Partial updates |
| Link customer to offer builder: replace manual customer input | 2h | Pending | Search & select from Mesonic data |

### Week 4: Article Catalog

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Fetch articles from Mesonic (Type 4, Lesen) | 2h | Pending | Full catalog pull |
| Fetch prices from Mesonic (Type 5, Lesen) | 2h | Pending | Price lists, tier pricing |
| Article list view: categorized, searchable catalog | 3h | Pending | Group by category |
| Article detail view: description, prices, stock info | 2h | Pending | |
| Replace hardcoded KASSA/HARDWARE arrays with live Mesonic data | 4h | Pending | Major refactor of product data |
| Price calculation: handle Mesonic price tiers and discounts | 2h | Pending | Match current tier logic |

### Week 5: Team Data Migration & Integration

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Replace hardcoded TEAM array with user_profiles query | 3h | Pending | Single source of truth |
| Update offer PDF generation to use profile data | 2h | Pending | Creator info from profiles |
| Add phone, location fields to user_profiles if missing | 1h | Pending | Match current TEAM fields |
| Customer → Offer flow: select customer, auto-fill offer form | 3h | Pending | End-to-end integration |
| Offer → Customer link: store Mesonic customer ID on offers | 2h | Pending | Foreign key in offers table |
| Integration testing: full flow from customer search to offer creation | 3h | Pending | |

---

## Phase 3: Belege (Documents/Invoices)

**Duration:** 3 weeks | **Depends on:** Phase 2 (Customers & Articles)

### Week 6: Beleg Reading & Display

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Fetch Belege from Mesonic (Type 30, Lesen) | 3h | Pending | Offers, orders, invoices |
| Beleg list view: filterable by type, status, date range, customer | 4h | Pending | Column sorting, pagination |
| Beleg detail view: header, positions, totals | 3h | Pending | Read-only initially |
| Customer → Belege tab: show all documents for a customer | 2h | Pending | Linked via customer number |
| Beleg PDF preview: render Mesonic document as PDF | 3h | Pending | Using existing PDF infrastructure |

### Week 7: Beleg Creation

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Create offer Beleg: push offer data to Mesonic (Type 30, Schreiben) | 4h | Pending | Map offer items to Beleg positions |
| Create order from offer: convert offer → order in Mesonic | 3h | Pending | Beleg transformation |
| Create invoice from order: order → invoice conversion | 3h | Pending | |
| Beleg status tracking: map Mesonic status to UI states | 2h | Pending | |
| Connect offer builder: Save to Supabase AND create Mesonic Beleg | 3h | Pending | Dual persistence |

### Week 8: Beleg Polish & Edge Cases

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Beleg number formatting: match Mesonic numbering scheme | 2h | Pending | |
| Multi-currency and tax handling | 2h | Pending | Austrian VAT rules |
| Beleg duplication: copy existing Beleg as template | 2h | Pending | |
| Beleg search: full-text search across Beleg data | 2h | Pending | |
| Error handling: Mesonic write failures, validation errors | 2h | Pending | User-friendly error messages |
| Integration testing: full offer → order → invoice flow | 3h | Pending | |

---

## Phase 4: Ticket Management

**Duration:** 3 weeks | **Depends on:** Phase 1 (Auth & Profiles)

### Database Schema

All ticket data lives in Supabase (not Mesonic):

- **tickets:** id, ticket_number (auto), customer_id, customer_name, subject, description, status (open/in_progress/waiting/resolved/closed), priority (low/medium/high/urgent), pool (kassen/it/netzwerk), assigned_to (user_profiles FK), created_by, notify_customer boolean, customer_email, timestamps
- **ticket_messages:** id, ticket_id FK, author_id FK, content (text), visibility (public/internal), timestamps
- **ticket_time_entries:** id, ticket_id FK, user_id FK, duration_minutes, description, billable boolean, date, timestamps
- **ticket_attachments:** id, ticket_id FK, message_id FK (optional), file_name, file_path (Supabase Storage), file_size, mime_type, uploaded_by FK, timestamps

### Week 9: Ticket CRUD & Pools

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Supabase migration: tickets, ticket_messages, ticket_time_entries, ticket_attachments tables | 3h | Pending | RLS per pool/assignment |
| Ticket list view: filter by pool, status, assignee, priority | 4h | Pending | Pool tabs, badge counts |
| Create ticket form: customer search, pool/assignee selection, priority | 3h | Pending | Link to Mesonic customer |
| Ticket detail view: header, status bar, assignment info | 3h | Pending | |
| Pool assignment logic: employees see tickets for their configured pools | 2h | Pending | Based on user_profiles.pools |
| Pick ticket: unassigned → assigned_to = current user | 1h | Pending | One-click claim |
| Ticket status transitions: open → in_progress → waiting → resolved → closed | 2h | Pending | State machine with validation |

### Week 10: Communication & Attachments

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Message thread UI: chronological messages with public/internal toggle | 4h | Pending | Internal messages visually distinct |
| Add message: rich text input with visibility selector | 2h | Pending | Default to internal |
| Customer email notification on ticket creation | 3h | Pending | Via Resend, controlled by notify_customer flag |
| Customer email notification on public message added | 2h | Pending | Only for visibility=public messages |
| Customer email notification on ticket resolved | 2h | Pending | Resolution summary |
| File attachments: upload to Supabase Storage, link to ticket or message | 3h | Pending | Drag & drop, file type validation |
| Time entry logging: duration, description, billable flag | 2h | Pending | Per-ticket time tracking |

### Week 11: Ticket → Invoice & Polish

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Time entry summary: total hours per ticket, billable vs non-billable | 2h | Pending | |
| Generate invoice: create Mesonic Beleg (Type 30) from billable time entries | 4h | Pending | Map time entries to Beleg positions |
| Ticket → Invoice link: store Beleg reference on ticket | 1h | Pending | |
| Ticket search: full-text search across tickets and messages | 2h | Pending | |
| Supabase Realtime: live updates when colleagues add messages or change status | 3h | Pending | Subscribe to ticket changes |
| Ticket dashboard: open per pool, my assigned, overdue, avg resolution time | 3h | Pending | |

---

## Phase 5: Contacts & Dashboard

**Duration:** 2 weeks | **Depends on:** Phase 2 + Phase 3

### Week 12: Contact Management

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Fetch contacts from Mesonic (Type 7, Lesen) | 2h | Pending | Linked to customers |
| Contact list per customer: name, role, phone, email | 2h | Pending | |
| Create/edit contact in Mesonic | 3h | Pending | Type 7, Schreiben |
| Activity timeline per customer: offers, Belege, tickets, contacts in one view | 4h | Pending | Aggregated from all sources |
| Quick actions: create ticket, create offer, call contact from customer view | 2h | Pending | |

### Week 13: CRM Dashboard

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Dashboard layout: KPI cards, charts, recent activity | 3h | Pending | Responsive grid |
| Pipeline value: sum of open offers grouped by stage | 2h | Pending | From Supabase offers table |
| Ticket KPIs: open per pool, avg resolution time, overdue count | 2h | Pending | From tickets table |
| Revenue overview: invoiced amounts from Mesonic Belege | 3h | Pending | Aggregated from Type 30 |
| My tasks: assigned tickets, pending offers, follow-ups | 2h | Pending | Per-user view |
| Recent activity feed: latest changes across all modules | 2h | Pending | |

---

## Phase 6: Refactoring & Hardening

**Duration:** 2 weeks | **Depends on:** All previous phases

### Week 14: Frontend Architecture

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Split App.jsx monolith (2100+ lines) into route-based components | 6h | Pending | React Router with lazy loading |
| Add React Router: /dashboard, /customers, /articles, /offers, /belege, /tickets, /admin | 3h | Pending | |
| Shared layout: sidebar navigation, header with user info | 3h | Pending | |
| Role-based route access: admin, sales, support roles | 2h | Pending | Based on user_profiles.role |
| Error boundaries: graceful error handling per route | 2h | Pending | |

### Week 15: Performance & Security

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Pagination for all list views: cursor-based for Mesonic, offset for Supabase | 3h | Pending | |
| Virtual scrolling for large datasets (react-window) | 2h | Pending | Articles, Belege lists |
| Offline handling: queue Mesonic writes, retry on reconnect | 3h | Pending | |
| Optimistic UI: instant feedback on mutations | 2h | Pending | |
| Audit logging: track who changed what and when | 3h | Pending | Supabase table + triggers |
| Security review: RLS policies, input sanitization, API auth | 2h | Pending | |

---

## Phase 7: Electron & Starface CTI (Future)

**Duration:** 3+ weeks | **Priority:** Low (not needed for first release)

### Electron Desktop App

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Electron shell: wrap web app in native window | 3h | Pending | electron-forge or electron-builder |
| Auto-updater: push updates to desktop clients | 3h | Pending | electron-updater |
| Native notifications: system tray, ticket alerts | 2h | Pending | |
| Local file access: save PDFs to filesystem directly | 2h | Pending | Electron dialog API |

### Starface CTI Integration

| Task | Est. | Status | Notes |
|------|------|--------|-------|
| Starface REST API: authenticate, subscribe to call events | 3h | Pending | Polling or WebSocket |
| Incoming call detection: extract caller number | 2h | Pending | |
| Customer lookup: match caller number to Mesonic customer | 2h | Pending | Search by phone number |
| CTI popup: show customer info, open tickets, recent activity on incoming call | 4h | Pending | Electron notification window |
| Click-to-call: initiate call from customer view | 2h | Pending | Starface originate API |

---

## Key Technical Decisions

### Authentication

Microsoft Entra ID SSO via Supabase Azure provider. Profile trigger creates user_profiles row on first login. RLS uses simple permissive policies to avoid infinite recursion; admin enforcement happens in the app layer. The `onAuthStateChange` callback must be synchronous (no await) to prevent Supabase client deadlock; profile fetch happens in a separate `useEffect`.

### Mesonic Integration Pattern

All Mesonic communication goes through a Supabase Edge Function proxy (`supabase/functions/mesonic-proxy`). The proxy logs into WinLine on each cold start (Edge Functions are stateless across isolates), caches the session within a single isolate lifetime (4-min TTL), and auto-retries on session expiry. EXIM templates define what data is read/written. The frontend never talks to WinLine directly.

**Key learnings:**
- Login response format is `Session=<uuid>` — must strip the `Session=` prefix before using as query param
- Deploy with `--no-verify-jwt` since we handle JWT verification inside the function
- XML response wraps records in `<MESOWebService Template="X"><X>fields</X></MESOWebService>`
- Single-key export works (e.g., `Key=29385`); wildcard/WHERE queries need Exportparameter enabled on templates
- Mesonic connection: `https://mesonic.kitz.co.at`, user `CRM_API`, company `2KCO`

### Data Ownership

Customers, articles, prices, contacts, and Belege live in Mesonic (source of truth). Tickets, user profiles, and offer drafts live in Supabase. Cross-references use Mesonic customer/article numbers stored as foreign keys in Supabase tables.

### Email Format Matching

KITZ employees have two email formats: `<first_initial>.<lastname>@kitz.co.at` (internal, used in TEAM array) and `<last_initial><first_initial>@kitz.co.at` (Microsoft SSO). The auth layer handles both patterns for auto-matching the logged-in user to their team entry.

### Naming Conventions

All database columns, code properties, and variable names must be in English. German is used only in UI labels and user-facing text. Examples: `mesonic_rep_id` (not `mesonic_vertreter_nr`), `customer_name` (not `kundenname`).

---

## Environment & Configuration

| Key | Value |
|-----|-------|
| Supabase Project | `uouryrnyzicdociqberq` |
| Azure Tenant ID | `3e0069ff-cd50-4459-b2a9-ab509a14f433` |
| Frontend Domain | `bessa.kitz.co.at` |
| Supabase Callback | `https://uouryrnyzicdociqberq.supabase.co/auth/v1/callback` |
| Admin Email | `kg@kitz.co.at` |
| Mesonic URL | `https://mesonic.kitz.co.at` |
| Mesonic User | `CRM_API` |
| Mesonic Company | `2KCO` |
| Mesonic Templates | WebKontenExport, WebArtikelExport, WebBelegExport (list templates pending) |
