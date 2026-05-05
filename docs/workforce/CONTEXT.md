# Workforce / Vacation Planner — Session Handover

> **For the next Claude session.** A previous Cowork session was working on this branch and ended early. This file captures the full state so you can pick up cleanly. Read it top to bottom before doing anything else.

**Working repo:** `/Users/georgkitz/work/bessa-offer-builder`
**Working branch:** `feature/workforce`
**Last verified status:** Phase B half-done — toolchain files written, dependencies not yet installed, script `scripts/setup_workforce_branch.sh` not yet executed successfully.

---

## 1. Big-picture goal

The user (Georg, with his father Herbert as co-owner) runs **KITZ Computer & Office GmbH** in Klagenfurt and Wolfsberg, Austria. The existing `bessa-offer-builder` app is a React/Vite/Supabase tool for sales offer creation, with CRM and Mesonic ERP integration in progress.

The new initiative is to add a **Workforce module** inside the same app, starting with a **Vacation Planner** for the company's ~18 employees. This will sit alongside the offer/CRM modules and grow over time into shift planning, time tracking, on-call, etc.

The full requirements + decisions are in **`docs/workforce/Urlaubsplaner_Konzept_v4.docx`** (currently at the repo root as `Urlaubsplaner_Konzept_v4.docx` — the setup script moves it; verify with `ls`). The doc is in German, ~5 pages, exhaustive on rules, blackouts, employee mapping, and the rules engine. **Read it before designing the data model.**

Key absentee categories (each as its own bucket): Urlaub, Zeitausgleich, Krankenstand, Schule (Berufsschule, Lehrlinge), Pflegeurlaub, Schulung/Seminar/Messen, Sonderurlaub.

---

## 2. The team (data we'll seed the system with)

From CSV the user uploaded. **Primary** = Hauptrolle, **Secondary** = Aushilfe.

| MA | Standort | Hauptrolle | Zusatzrolle | Vertreter |
|----|----------|-----------|-------------|-----------|
| Heimo Russnig | Klagenfurt | Kassen | MFP (only when Mario Graf available) | Christian O., Marko B. |
| Anton Huber | Klagenfurt | Kassen | – | Christian O., Marko B., Heimo R. |
| Alexander Flagl | Klagenfurt | IT | – | Sandro K., Christian O. |
| Andreas Nowak | Klagenfurt | Verkauf | – | (none — TBD) |
| Gudrun Triebelnig | Klagenfurt | Büro | – | Andreas Nowak |
| Georg Kitz | Klagenfurt | Geschäftsführung | – | – |
| Marko Buchbauer | Wolfsberg | Kassen | – | Heimo R., Christian O. |
| Christian Oberlerchner | Wolfsberg | Kassen (Spezialist) | IT-Aushilfe | Heimo R., Marko B. |
| Sandro Kumpusch | Wolfsberg | IT | – | Alexander F., Christian O. |
| Stefan Bauer | Wolfsberg | MFP | – | Mario Graf |
| Mario Graf | Wolfsberg | MFP | – | Stefan Bauer |
| Marc Maier (Lehrling) | Wolfsberg | MFP-Lehrling | – | (none — TBD) |
| Helmut Bauer | Wolfsberg | Verkauf | – | Daniel Scharf |
| Daniel Scharf | Wolfsberg | Verkauf | – | Helmut Bauer |
| Waltraud Kriegl | Wolfsberg | Büro | – | Sabine Riedl |
| Sabine Riedl | Wolfsberg | Büro | – | Waltraud Kriegl |
| Daniela Thorer | Wolfsberg | Büro | – | Birgit Zmug |
| Birgit Zmug | Wolfsberg | Büro | – | Daniela Thorer |
| Herbert Kitz | Wolfsberg | Geschäftsführung | – | – |

Hard rules already agreed:
- **Stefan Bauer ↔ Mario Graf**: never both on vacation simultaneously (hard block, overrides everything else).
- **Heimo's MFP-Aushilfe in Klagenfurt** only valid while Mario Graf is available — supervision dependency.
- **Cross-Standort substitutes** trigger a *warning* (not a block) — used to flag "telephone-only" vertretung.
- **Approvers**: Georg + Herbert. Either can approve, including from vacation. No deputy needed.

Other final rules from the concept doc: 4 weeks lead time, all employees can see the full team calendar, blackout periods Wörthersee Apr-end → June and Skigebiete mid-Nov → mid-Dec, Fenstertage max 50% per Standort+Abteilung, vacation entitlement starts after the 6th employment month, half-year planning rule (50%), Krankenstand entered by employee themselves, weekly working hours stored on each employee for part-time accrual.

---

## 3. Branch / commit state

**On `main`** (already pushed by the user):
```
2a85cc9 feat(billing): online offer acceptance with QR code and Stripe checkout
a56e522 docs(mesonic): add Mesonic WinLine API analysis and PDF-to-Mesonic mapping
927091d chore(gitignore): ignore env files, build artifacts, and local agent state
```

**On `feature/workforce`** (branched from main, no commits yet — files created in working tree, awaiting setup script run):
- Branch was created from the previous Cowork sandbox via `git checkout -b feature/workforce`. Verify with `git branch --show-current`. If it's missing, `git checkout -b feature/workforce` from main.

---

## 4. Phase plan

| Phase | Status | Description |
|-------|--------|-------------|
| A | ✅ done | Commit pre-existing main work in three logical groups (gitignore / docs / billing). User ran `scripts/commit_main_changes.sh`. |
| B | 🟡 in progress | Set up TypeScript + Vitest toolchain on `feature/workforce`. Files written, dependencies not yet installed. Script `scripts/setup_workforce_branch.sh` errored on the user's machine — error not yet shared. |
| C | ⏳ pending | Write unit tests for the **current** code (App.jsx, offerApi, AUTO_TERM_RULES, totals calculation, urlState, qr) before the refactor — this is the safety net. |
| D | ⏳ pending | Incrementally refactor `src/App.jsx` (3282 lines!) into modules. ~6-7 commits, build + tests green after each step. End state: `App.jsx` ~80 lines (routing only), everything else under `src/features/`, `src/shared/`. |
| E | ⏳ pending | Scaffold the `features/vacation/` module: data model (Supabase migration), seed employee data from CSV above, rules engine skeleton with first tests. |

---

## 5. Files added in Phase B (already on disk, not committed)

```
tsconfig.json                  # main TS config; allowJs: true for incremental migration
tsconfig.node.json             # for vite.config.ts
vite.config.ts                 # replaces vite.config.js; embeds Vitest config
vitest.setup.ts                # @testing-library/jest-dom matchers + DOM cleanup
src/vite-env.d.ts              # types for __GIT_HASH__, __BUILD_TIME__, import.meta.env
src/__tests__/smoke.test.ts    # three trivial passing tests to verify the runner
package.json                   # added: typescript, vitest, @testing-library/*, jsdom, @types/*
scripts/setup_workforce_branch.sh   # phase-B installer (not yet run)
scripts/commit_main_changes.sh      # phase-A installer (already run)
```

`vite.config.js` (the old `.js` one) and `vite.config.js.timestamp-*.mjs` artifacts are **still on disk** — the setup script removes them. They're harmless but should be cleaned up before commit.

The Urlaubsplaner concept docs (`Urlaubsplaner_Konzept.docx`, `_v2`, `_v3`, `_v4`) are at the **repo root**, currently gitignored by the rule `Urlaubsplaner_Konzept*.docx`. The setup script moves v4 to `docs/workforce/Urlaubsplaner_Konzept_v4.docx` and `git add -f`s it; deletes v1-v3.

---

## 6. Sandbox limitation (was a constraint in the previous session)

The previous Cowork session ran in a Linux sandbox where `.git/index.lock` files could not be `unlink()`-ed by git after commit, breaking `git commit` from inside the agent. Workaround: agent wrote shell scripts under `scripts/`, user ran them in their host terminal (which doesn't have the limitation).

**For a Claude Code CLI session this is not a problem.** You can run `git commit` directly. You don't need the script wrappers. The two scripts in `scripts/` are still useful artifacts that document what was committed and why — feel free to delete `scripts/commit_main_changes.sh` once the work it represented is on origin/main (it is). `scripts/setup_workforce_branch.sh` either run as-is or replicate its steps inline.

---

## 7. What to do next

**Step 1 — Verify the state**
```bash
git branch --show-current   # should be feature/workforce
git log --oneline -5
git status
ls tsconfig.json vite.config.ts vitest.setup.ts src/__tests__/smoke.test.ts
```

**Step 2 — Finish Phase B**

Find out why the user's setup script errored. Most likely candidates:
- `yarn install` failure due to peer-dep mismatch on `@testing-library/react@16` (requires React 19 in some metadata; works with React 18 via peerDependencies but some yarn versions complain).  Fallback: `@testing-library/react@^15.0.7`.
- Missing Node version (`@types/node@22` requires Node 18+).
- `yarn build` failing because the new `vite.config.ts` runs `git rev-parse` and might fail in some environment.

Ask the user for the actual error. Then either fix `package.json` / `scripts/setup_workforce_branch.sh` and rerun, or do the steps manually:

```bash
rm -f vite.config.js vite.config.js.timestamp-*.mjs
rm -f Urlaubsplaner_Konzept.docx Urlaubsplaner_Konzept_v2.docx Urlaubsplaner_Konzept_v3.docx
mkdir -p docs/workforce
mv Urlaubsplaner_Konzept_v4.docx docs/workforce/
yarn install
yarn test:run     # smoke tests must pass
yarn build        # production build must work
git add -A
git add -f docs/workforce/Urlaubsplaner_Konzept_v4.docx
git commit -m "chore(toolchain): TypeScript + Vitest for workforce branch"
git push -u origin feature/workforce
```

**Step 3 — Phase C: tests for the current code**

Recommended targets in order:
1. `src/lib/qr.js` — `generateAcceptQr(shareCode)` (mock `QRCode.toDataURL` and `window.location`).
2. `src/lib/urlState.js` — encoding/decoding of the offer URL state.
3. `AUTO_TERM_RULES` and `TIER_*` mappings in `src/App.jsx` (extract these into `src/data/tiers.ts` first, then test).
4. The total-calculation logic in `App.jsx` — find the function (`useMemo` for totals around line ~2100ish) and extract to `src/lib/totals.ts`. This is the highest-risk thing to break in the refactor.
5. `src/lib/offerApi.js` — happy-path tests with a mocked supabase client (the file already imports `./supabase`; mock it in the test).

Do NOT try to test `OfferView` / `OfferList` end-to-end yet — too big, will become easier after Phase D splits them.

**Step 4 — Phase D: incremental refactor**

Proposed target structure (already agreed with user):
```
src/
  App.jsx                  # router only, ~80 lines
  main.jsx
  index.css
  shared/
    components/            # AppShell, LoginPage, ProtectedRoute, Badges, SortableRow
    lib/                   # auth, supabase, urlState, qr
  features/
    offers/
      data/                # catalog (BESSA, MELZER, ...), tiers, autoTermRules
      api/                 # offerApi
      components/          # ItemCard, OfferView, modals, SignaturePad
      pages/               # OfferBuilderPage, OfferListPage, AcceptPage
      pdf/                 # OfferPdfDocument, pdfStyles
    crm/
      components/          # CrmPage, CustomerForm, CustomerPicker
    mesonic/
      api/, components/, data/
    admin/
      components/, api/    # AdminUserMapping, profileApi
    vacation/              # NEW — for Phase E
      data/, api/, components/, pages/, rules/
```

Commit order from the previous session:
1. extract data (catalogs, tiers, AUTO_TERM_RULES) → `features/offers/data/`
2. extract small components (Badges, SortableRow, SignaturePad) → `shared/components/` & `features/offers/components/`
3. extract modals (Custom/Edit/EmailPreview/Sign) → `features/offers/components/modals/`
4. extract `OfferView` (~415 lines) → `features/offers/components/OfferView.tsx`
5. extract `OfferList` (~290 lines) → `features/offers/pages/OfferListPage.tsx`
6. extract `AcceptPage` (~360 lines) → `features/offers/pages/AcceptPage.tsx`
7. final: `App.jsx` becomes thin router

After each step: `yarn test:run && yarn build` must pass. Migrate to `.tsx` opportunistically (allowJs lets you do it gradually — start with the new files in TS, only convert existing files when you touch them).

**Step 5 — Phase E: vacation module**

Start with the data model. Sketch a Supabase migration with these tables:
- `employees` (id, name, email, hire_date, weekly_hours, employment_type, primary_role_id, standort_id, supervisor_id?, created_at, updated_at)
- `standorte` (id, name) — seed: Klagenfurt, Wolfsberg
- `abteilungen` (id, name) — seed: Büro, Verkauf, Kassen, IT, MFP, Geschäftsführung
- `employee_roles` (employee_id, abteilung_id, standort_id, kind: 'primary'|'secondary', valid_from, valid_to, supervisor_employee_id?) — supports Christian (Kassen primary + IT secondary) and Heimo (Kassen primary + MFP secondary with supervisor=Mario)
- `substitutes` (employee_id, substitute_employee_id, priority)
- `coverage_rules` (id, scope_standort_id?, scope_abteilung_id?, max_concurrent_on_leave, kind: 'soft'|'hard') — including the global Stefan↔Mario hard block as a special row
- `blackout_periods` (id, name, start_date, end_date, applies_to_standorte[], applies_to_abteilungen[], severity)
- `leave_types` (id, code, label, deducts_from_balance) — Urlaub, ZA, Krankenstand, Schule, Pflege, Schulung, Sonderurlaub
- `leave_balances` (employee_id, year, leave_type_id, entitled, used, planned, carried_over)
- `leave_requests` (id, employee_id, leave_type_id, start_date, end_date, half_day_start, half_day_end, status, reason, substitute_id, created_at, decided_at, decided_by, decision_note)
- `audit_log` (id, actor_id, action, entity_type, entity_id, details, created_at) — important for AK/Betriebsrat traceability

Seed the employees from the CSV / table in Section 2 above. Build the rules engine as pure functions in `src/features/vacation/rules/` with each rule a small testable function (`leadTime`, `coverageMin`, `blackout`, `hardBlock`, `fenstertage50pct`, etc.) returning `{ ok, violations: [], warnings: [] }`. Compose them in a single `validateLeaveRequest(request, context)`.

Tests first — for the rules engine especially. Each rule should have a unit test before any UI is wired up.

---

## 8. User preferences (from the previous session)

- **German UI** for everything user-facing.
- **Casual but professional** tone in conversation, **prose over bullet points** in chat replies. The user values "what you would have a smart colleague tell you" over "report-style output."
- **Ask clarifying questions before bulk work** (use AskUserQuestion in Cowork; in CLI, just ask plainly).
- **Incremental commits** — never one giant refactor.
- **TypeScript-first for new code**, JSX preserved during migration.
- **The user's father Herbert reviews concepts**; user often forwards summaries written for non-technical readers. The concept doc was iterated v1→v4 based on his feedback.

---

## 9. Pointers

- Concept doc (canonical): `docs/workforce/Urlaubsplaner_Konzept_v4.docx`
- Phase-A commit script (already run): `scripts/commit_main_changes.sh`
- Phase-B setup script (still to run): `scripts/setup_workforce_branch.sh`
- Existing offer-builder source: `src/App.jsx` (3282 lines, the refactor target)
- Tailwind / Vite / Supabase stack — no Next.js, no app-router, classic SPA.
- Deploy target: GitHub Pages (`yarn deploy`).

Good luck — pick up at "Step 2" once you've verified state.
