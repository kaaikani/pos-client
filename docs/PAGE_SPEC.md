# Page Specification — what every screen should actually be

> The rule this document exists to enforce: **list-first, not form-first.**
> People come to a screen to *find* a record far more often than to *add* one, so
> the list gets the screen and `+ New` opens the form. Zoho Books, Xero and
> QuickBooks all work this way; the original build did the opposite on every screen.

## The two shapes

**Record module** — masters and transactions.
```
LIST   PageHeader (title · KPI stats · Refresh · + New)
       ListToolbar (search · filters · row actions · count)
       DataTable (the columns a user scans for)
       ActionBar (shortcut hints · + New)
   ↓ + New / open row
FORM   FormHeader (← back · record identity · Save/Delete)
       FormSection × N (grouped fields, rare ones collapsed)
       ActionBar (Cancel · Save)
```

**Workspace** — POS billing only. One screen, no list/form split, keyboard-driven,
everything reachable without leaving it.

## Column rule

A list column earns its place only if someone **scans, sorts or filters** by it.
Everything else belongs in the form or the detail panel. Item Master had 40+ fields
on screen at once and only 2 columns in its list — exactly backwards.

---

## Per-page specification

| # | Page | Shape | List columns | KPI stats | Form sections | Status |
|---|---|---|---|---|---|---|
| 1 | **Item Master** | Record | Code · Name+Brand · Category · Unit · Purchase · Sales · MRP · Stock · Tax | Items · Low stock · Stock value | Identity · Pricing · Tax & GST · Stock & Barcode · More (collapsed) | ✅ **Done** |
| 2 | **Token Entry** | Record | Token · Time · Customer · Mobile · Amount · Extra · Total · Print | Tokens today · Collected | Token · Customer · Charges | ✅ **Done** |
| 3 | **Purchase** | Record | Pur No · Date · Supplier · Invoice No · Items · Taxable · Tax · Net · Status | Purchases MTD · Value · Unpaid | Supplier & Invoice · Item grid · Charges · Totals | ⬜ Next |
| 4 | **Purchase List** | merge into #3 as its list view — it should not be a separate page | | | | ⬜ |
| 5 | **Purchase Return** | Record | Ret No · Date · Supplier · Src Bill · Reason · Amount | Returns MTD · Value | Source bill picker · Return grid | 🟨 Logic done, needs new shell |
| 6 | **Stock Adjustment** | Record | Adj No · Date · Item · Type · Qty · Before → After · Reason | Adjustments today · Net qty | Item picker · Adjustment lines | 🟨 Logic done, needs new shell |
| 7 | **Inventory** | Record (read-only) | Code · Item · Category · On hand · Reorder · Value · Status badge | SKUs · Low · Out · Total value | — (drill-through to stock ledger) | ⬜ |
| 8 | **Customers** | Record | Name · Mobile · Email · Outstanding · Last bill · Status | Customers · Total receivable · Overdue | Identity · Contact · Credit terms | ⬜ |
| 9 | **Ledger** | Record + detail | Party · Type · Opening · Debit · Credit · Balance · Ageing | Receivable · Payable · Overdue | Party · Opening balance · Credit days — **row opens a statement view** | ⬜ |
| 10 | **Receipt** | Record | Rec No · Date · Customer · Mode · Ref · Amount · Allocated | Received today/MTD · Unallocated | Customer · Payment · Invoice allocation grid | ⬜ |
| 11 | **Payment** | Record | Pay No · Date · Supplier · Mode · Ref · Amount · Allocated | Paid today/MTD · Unallocated | Supplier · Payment · Bill allocation grid | ⬜ |
| 12 | **Category** | Record | Name · Parent · Items · Status | Categories · Items uncategorised | Name · Parent · Description | ⬜ |
| 13 | **Barcode** | Workspace | — (label designer is already good) | — | keep as-is, restyle to tokens | ⬜ restyle only |
| 14 | **Stock Updation** | Record | Code · Item · On hand · Reorder · Max | Below reorder | inline-edit reorder/max — **rename to "Reorder Levels"** | ⬜ |
| 15 | **Inward / GRN** | Record | — | — | **blocked: no server backend (BUG-004)** | ⬜ blocked |
| 16 | **Reports** | Report shell | per-report | per-report | date range · filters · export | ⬜ |
| 17 | **Users** | Record | Username · Name · Role · Status · Last login | Users · Active | Identity · Role · Password | ⬜ |
| 18 | **Settings** | Settings shell | — | — | tabbed: Company · Print · Tax · Config · Backup | ⬜ |
| 19 | **Dashboard** | Dashboard | — | Receivables · Payables · Sales today/MTD · Cash · Low stock | KPI row → cash-flow chart → top items → recent bills → alerts | ⬜ |
| 20 | **POS Billing** | Workspace | cart grid | live totals | — | ⬜ **last** — biggest file, most risk |

---

## What is missing from every page today

These apply across the board and get fixed by the shared primitives, not per page:

1. **No list view** on most masters — the form was the landing screen.
2. **No search or filter** on most lists.
3. **No KPI header** — the numbers a manager opens the screen for are absent.
4. **No empty state** — a new install shows a blank white box.
5. **No loading state** — the screen looks broken while data loads.
6. **`alert()` / `confirm()`** — 162 of them, blocking and unstyled.
7. **No keyboard flow** on 14 of 20 modules.
8. **No row actions** — no edit/delete/print without leaving the screen.
9. **No totals row** on money tables.
10. **Per-module colour schemes** — amber, rose, teal, indigo gradients. One product should have one palette.

---

## Build order

Foundation is done (`components/pos/*`). Remaining order, chosen by
how much each screen is used and how much it teaches the next one:

1. **Purchase** (+ absorb Purchase List) — establishes the *item-grid entry* pattern
   that Purchase Return, Sales Return and POS all reuse.
2. **Purchase Return · Stock Adjustment** — reshell onto the grid pattern.
3. **Ledger · Receipt · Payment** — establishes the *allocation grid* pattern.
4. **Customers · Category · Reorder Levels · Users** — simple record modules, fast.
5. **Inventory · Reports · Dashboard** — read-only, needs the chart set.
6. **Settings** — tabbed shell.
7. **POS Billing** — last. Largest file, highest risk, and it depends on the grid
   pattern being proven everywhere else first.
