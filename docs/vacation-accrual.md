# Urlaubsjahr accrual (self-updating vacation entitlement)

## Why

KITZ runs vacation on the Austrian **Arbeitsjahr** model: each employee earns a
fresh entitlement on the anniversary of their entry date, **not** on 1 January.
The paper "Urlaubsliste" is a per-person snapshot — a remaining-days figure plus
the `bis <date>` = the day the current Arbeitsjahr ends.

The app previously modelled balances by **calendar year** (`leave_balances.year`,
and the balance panel summed leaves Jan 1–Dec 31). That breaks under anniversary
accrual: on 1 January the UI would look for a calendar-year row that doesn't
exist, and leave taken between Jan 1 and the anniversary would be netted against
the wrong entitlement. So the balance is now **Arbeitsjahr-window based**.

## Model

Each employee carries, on their `urlaub` `leave_balances` row (exactly one per
employee):

- `entitled`     — the current Arbeitsjahr's grant (at go-live: the Resturlaub snapshot)
- `carried_over` — remainder brought in from the prior Arbeitsjahr
- `period_start` / `period_end` — the current Arbeitsjahr window

and on `employees`:

- `annual_entitlement` — the fresh grant added each new Arbeitsjahr (25 default;
  30 for the 25-year seniors; 20/24 for the 4-day-week part-timers)
- `urlaubsjahr_reset`  — the **next** reset date (= current `period_end` + 1 day)

`remaining = entitled + carried_over − used − planned`, where used/planned are
still computed at read time from `leave_requests`, but over `[period_start,
period_end]` instead of the calendar year.

## Accrual job

`run_urlaubsjahr_accrual(p_today)` (plpgsql, in migration
`20260917120200`), scheduled nightly via pg_cron (`urlaubsjahr-accrual`, 02:00
UTC). For every active employee whose `urlaubsjahr_reset <= today`:

1. Compute days used in the closing period from `leave_requests`
   (`leave_working_days()` mirrors the JS `countWorkingDays` — Mon–Fri, half-days).
2. `carried_over := entitled + carried_over − used`  (the true remainder, may be <0)
3. `entitled := annual_entitlement`; roll `period_start/period_end` and
   `urlaubsjahr_reset` forward one year.
4. Audit-log `balance.accrued`.

It loops, so a missed year (or a multi-year backfill) settles in one run. Pure
in-DB — no edge function, no secrets.

### v1 scope / known gaps

- **Verjährung (2-year forfeiture)** is NOT enforced — v1 carries the full
  remainder forward. Safe (never under-grants); add tranche aging later.
- **Part-time day counting**: Kriegl/Riedl/Triebelnig work a 4-day week and are
  granted in their own unit (20/24), but `leave_working_days` counts Mon–Fri, so
  a full week off charges them 5, not 4. The accrual is correct; usage counting
  for 4-day-weekers is a separate follow-up.

## Go-live data (backfill `20260917120100`, from Urlaubsliste STAND 16-09-2026)

`reset_date` = the PDF `bis` date. `entitled` = the Resturlaub snapshot.
`annual_entitlement` per HR (2026-09).

| code | name | Resturlaub | grant | reset |
|---|---|---|---|---|
| hbauer | Helmut Bauer | 16 | 30 | 2027-03-29 |
| dscharf | Daniel Scharf-Kraxner | 8 | 25 | 2027-03-12 |
| hscheiber | Heribert Scheiber | 13 | 30 | 2027-04-17 |
| skumpusch | Sandro Kumpusch | 10 | 25 | 2026-10-12 |
| mgraf | Mario Graf | 4.5 | 30 | 2026-11-30 |
| sbauer | Stefan Bauer | 22 | 25 | 2027-06-21 |
| coberlerchner | Christian Oberlerchner | 38 | 25 | 2027-08-15 |
| mbuchbauer | Marko Buchbauer | 10 | 25 | 2026-11-01 |
| mmaier | Marc Maier | 18 | 25 | 2027-07-20 |
| bzmug | Birgit Zmug | 9.5 | 25 | 2026-11-02 |
| dthorer | Daniela Thorer | 21 | 25 | 2027-04-07 |
| wkriegl | Waltraud Kriegl | 6.5 | 20 | 2027-01-21 |
| sriedl | Sabine Riedl | 19 | 20 | 2027-08-28 |
| gtriebelnig | Gudrun Triebelnig | 27 | 24 | 2027-06-10 |
| ahuber | Anton Huber | 26 | 25 | 2027-07-01 |
| anowak | Andreas Nowak | 3.5 | 25 | 2027-02-01 |
| hrussnig | Heimo Russnig | 3 | 25 | 2026-10-02 |
| aflagl | Alexander Flagl | 12 | 25 | 2027-01-11 |
| pfilipovic | Pavo Filipovic | 21 | 25 | 2027-06-01 |

Not accrued (left null): Georg Kitz, Herbert Kitz (GF), Dorothea Kitz, Marcel
Klein — not on the Urlaubsliste.

## Go-live runbook

1. **Wipe test leaves** (keep only Graf's vacations + Nowak's Krankenstand):
   ```sql
   delete from leave_requests lr using employees e, leave_types lt
   where lr.employee_id = e.id and lr.leave_type_id = lt.id
     and not (e.code = 'mgraf' or (e.code = 'anowak' and lt.code = 'krankenstand'));
   ```
2. Apply migrations `20260917120000` / `120100` / `120200` (`supabase db push`).
3. Verify balances: Graf 0.5, Nowak 3.5, everyone else = their paper figure.

First accrual fires **2026-10-02** (Russnig), so the job must be live before then.
