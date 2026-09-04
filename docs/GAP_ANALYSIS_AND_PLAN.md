# POS ERP — Full Gap Analysis & Remediation Plan

> Evidence-based audit of `d:\POS_API` (Vendure 3.5.5 server + Next.js 16 client).
> Written 2026-08-27. Complements `PROJECT_ROADMAP.md` (which covers the *feature* backlog);
> this document covers the five **cross-cutting quality problems**: printing, front/back
> wiring, accounting completeness, UI/keyboard, and API sprawl.

---

## 0. Executive summary

| Area | Verdict | Evidence |
|---|---|---|
| Printing (A4/A5/3"/4"/barcode) | 🟨 **~70% there** — document model + PDF layouts are good; **transport layer missing** | `core/invoice/invoice-pdf.js` supports A4/A5/A6/3"/4"/6"; QZ direct-print wired **only** for barcode labels (`barcode-module.jsx:129`), not invoices |
| Front ↔ Back wiring | 🟥 **Not trustworthy** — dual writes with no transaction, 2 competing query layers, silent `catch {}` | `SyncItemToVendureCommand` = 2 unguarded Vendure writes; `pos-module.jsx:527` ledger write swallowed by `catch { console.warn }` |
| Accounting (Zoho-Books class) | 🟥 **~20%** — party subledger only. No Chart of Accounts, no double entry, no bank recon, no fiscal year, no Trial Balance / P&L / Balance Sheet | No accounting entity exists anywhere in `Server/src/plugins/**/entities/` |
| Inventory | 🟨 **~55%** — snapshot + ledger + adjustments exist; no per-lot batch entity, no warehouse, no transfer, no valuation | `pos-stock-ledger.entity.ts` exists; no `PosBatch`, no `PosWarehouse` |
| UI / UX | 🟥 **Not production-grade** — 162 native `alert()`/`confirm()`, 0 toasts, no design tokens, 20 modules × 20 different layouts | `grep "alert(|confirm("` → 162 hits; `sonner` installed but never imported |
| Keyboard / focus flow | 🟥 **14 of 20 modules have ZERO keyboard nav** | Only `pos-module` (9 Enter handlers), `payment`, `purchase`, `settings` have any; the rest are 0 |
| API normalization | 🟥 **Confirmed** — one business process = 4–7 round trips | Bill save = 7 calls; item save = 4 calls (see §6) |

**Single highest-leverage change:** put each business *process* behind **one transactional
server operation**. That one change simultaneously fixes the API sprawl, the dual-write
consistency bugs, and the bill-number race condition.

---

## 1. What a complete POS + Accounting product must have

Reference model — what Zoho Books plus a tier-1 Indian retail POS (GoFrugal / Marg / Vyapar) ship.
Legend: ✅ have · 🟨 partial · 🟦 backend only, no UI · 🟥 broken/stub · ⬜ missing.

### 1.1 Billing / POS counter
| Capability | Status |
|---|---|
| Keyboard-first billing screen | ✅ |
| Barcode / scanner billing | ✅ |
| Multi-tender split payment (cash/UPI/card/credit) | ✅ |
| Hold / recall bill | 🟨 browser-local only (BUG-009) |
| Split bill / merge bill | ⬜ |
| Price tiers (retail / wholesale / MRP) | 🟨 backend `PosItemPriceTier` exists, no POS selector |
| Discount schemes (line / bill / scheme / coupon) | 🟨 flat bill discount only |
| Loyalty points / gift card / wallet | ⬜ |
| **Counter / shift open-close + cash-drawer reconciliation (Z-report)** | ⬜ critical for retail |
| Sales-person commission | 🟨 field only, no report |
| **Offline-first billing (works when server is down)** | ⬜ critical |
| Bill cancel / edit with audit reason | 🟨 delete exists, no reason, no audit |
| Sales return from bill | 🟦 |
| Quotation → Sales Order → Delivery Challan → Invoice chain | ⬜ |
| e-Invoice (IRN/QR) + e-Way Bill | ⬜ legally required above the turnover threshold |

### 1.2 Purchase
| Capability | Status |
|---|---|
| Purchase entry | ✅ |
| Purchase list | ✅ |
| Purchase Order + convert to purchase | 🟦 |
| Goods receipt (GRN) / inward | 🟥 no backend at all (BUG-004) |
| Purchase return / debit note | 🟥 localStorage stub (BUG-002) |
| Landed cost (freight / duty apportionment) | ⬜ |
| Supplier price history / last purchase rate | ⬜ |
| Dedicated supplier master | 🟨 lives inside Ledger |

### 1.3 Inventory
| Capability | Status |
|---|---|
| Current stock + stock ledger | ✅ / 🟦 |
| Stock adjustment | 🟥 localStorage stub (BUG-001) |
| Min-stock / reorder | 🟨 mislabeled (BUG-005) |
| Batch / lot / expiry as a first-class entity | ⬜ field-level only |
| Serial-number tracking | ⬜ |
| Multi-warehouse + branch | ⬜ (`warehouseId` column seeded but unused) |
| Stock transfer between locations | ⬜ |
| Physical stock count / cycle-count sheet | ⬜ |
| **Valuation method (FIFO / Weighted Average) + stock value report** | ⬜ needed before P&L is meaningful |
| Composite / kit / BOM item | ⬜ |
| Multi-UOM with conversion (Box → Pc) | 🟨 `PosUnit` exists, conversion not applied in billing |

### 1.4 Accounting — the biggest gap
| Capability | Status |
|---|---|
| Party ledger (customer / supplier) | ✅ |
| Receipts / Payments | ✅ |
| Day Book | ✅ |
| Expense entry | 🟦 |
| GSTR-1 / GSTR-3B | 🟦 server ready, no UI |
| **Chart of Accounts (account groups & ledgers)** | ⬜ |
| **Double-entry journal (every txn posts Dr/Cr)** | ⬜ |
| Journal voucher / contra / adjustment entry | ⬜ |
| Bank & cash accounts + bank reconciliation | ⬜ |
| **Trial Balance** | ⬜ |
| **Profit & Loss** | ⬜ |
| **Balance Sheet** | ⬜ |
| Cash Flow statement | ⬜ |
| Fiscal year + period close / lock | ⬜ |
| Opening balances | ⬜ |
| Cost centre / project accounting | ⬜ |
| Recurring invoices / subscriptions | ⬜ |
| Credit Note / Debit Note as accounting documents | ⬜ |
| TDS / TCS | ⬜ |
| GSTR-2A / 2B reconciliation | ⬜ |
| Multi-currency | ⬜ |

> **Reality check:** what exists today is a *POS with a party ledger*, not an accounting system.
> Zoho-Books parity means building a real posting engine. That is Phase 4 below and is the
> largest single body of work left in the project.

### 1.5 Printing & documents
| Capability | Status |
|---|---|
| A4 / A5 / A6 GST tax-invoice PDF | ✅ `invoice-pdf.js` → `buildA4Doc` |
| 3" (76 mm) / 4" (104 mm) / 6" (152 mm) thermal receipt | ✅ `layoutFor()` |
| Barcode label designer (WYSIWYG) + PDF | ✅ `core/barcode/*` |
| QR code on label | ✅ |
| QZ Tray direct print — **labels** | ✅ |
| QZ Tray direct print — **invoices** | 🟥 missing; invoices go through the browser print dialog |
| Raw ESC/POS printing (fast thermal, cash-drawer kick, auto-cut) | ⬜ |
| Printer profile per counter, stored server-side | 🟥 `localStorage` only (`pharma_print_settings`) |
| Template designer for the invoice (like the barcode one) | ⬜ |
| Original / Duplicate / Triplicate copy marking | ⬜ GST requirement |
| Print for other document types (PO, GRN, return, receipt, voucher) | ⬜ |
| Email / WhatsApp the invoice | ⬜ |

### 1.6 Platform
| Capability | Status |
|---|---|
| Multi-company | ✅ |
| POS users + roles | 🟨 |
| Audit log (who changed what, when) | ⬜ |
| Notifications | ⬜ |
| Approval workflow | ⬜ |
| Backup / restore | 🟨 localStorage export only |
| DB migrations for production | 🟥 1 migration for ~25 tables (BUG-010) |

---

## 2. Printing — how a real POS company builds this

A production POS never couples "what to print" with "how to print". It uses **three layers**:

```
  Document Model            Renderer                  Transport
  ─────────────────────     ────────────────────      ────────────────────────────────
  invoice / label /     →   A4 PDF (pdfmake)      →   QZ Tray (PDF)    → USB / LAN printer
  PO / GRN / voucher        thermal PDF               QZ Tray (RAW)    → ESC/POS thermal
  — pure JSON, built        ESC/POS byte stream       Browser dialog   → fallback
    on the server           HTML                      Email / WhatsApp API
```

**This project has layers 1 and 2. Layer 3 exists only for barcode labels.**

### What to build
1. **Unify the transport.** Promote `core/barcode/qz-print.js` → `core/print/transport.js`
   exposing `printPdf(profile, base64)`, `printRaw(profile, bytes)`, `listPrinters()`, with an
   automatic browser-print fallback when QZ Tray is not running.
2. **Printer profiles server-side.** New `PosPrinterProfile` entity:
   `{ counterId, docType, printerName, paperSize, copies, transport: 'QZ_PDF'|'QZ_RAW'|'BROWSER', openDrawer, autoCut }`.
   A counter then prints invoices on its 3" thermal and A4 on the office laser without anyone
   touching browser settings. Today this is `localStorage` and is lost when cache is cleared.
3. **ESC/POS raw path for thermal.** pdfmake → PDF → raster on a 3" printer takes 1.5–3 s.
   ESC/POS text mode prints in ~200 ms and lets you kick the cash drawer and auto-cut.
   Keep the PDF path for preview, reprint, and A4.
4. **One document pipeline for every document type** — not just invoices. PO, GRN, purchase
   return, receipt, payment voucher, day book, Z-report all need print.
5. **GST copy marking** — "Original for Recipient / Duplicate for Transporter / Triplicate for
   Supplier" is mandatory on the A4 tax invoice.
6. **Reuse the barcode WYSIWYG designer for invoice templates.** A good template engine already
   exists (`label-templates.js`, `label-fields.js`); generalise it so a shop can move the logo or
   reorder columns on the bill without a code change. This is the single biggest differentiator
   against competitors.

---

## 3. Front ↔ Back connection — what is actually wrong

### 3.1 Dual writes with no transaction (data-corruption risk)
`SyncItemToVendureCommand` (`pharma.query.js:47`) performs, **from the browser**:
1. `createPharmaItem` (POS DB)
2. `createProduct` (Vendure)
3. `createProductVariants` (Vendure)

If step 3 fails you are left with an orphan Vendure product and a POS item with no variant.
There is no rollback and no reconciliation job.
**Fix:** one server mutation `commitItemMaster(input)` running all three in a TypeORM transaction.

### 3.2 Silent failures
`pos-module.jsx:527` — the CREDIT-sale ledger entry is wrapped in
`catch (err) { console.warn(...) }`. **A credit bill can save with no receivable recorded**
while the operator sees a success message. The same pattern appears in `ensureCustomer`
(`pos-module.jsx:1178`).

### 3.3 Two competing client query layers
- `core/queries/PosQueries.js` — `CreateSaleTransactionCommand`, `GetPosProductsQuery`
- `core/queries/pharma.query.js` — `CreateSaleCommand`, `ListItemsQuery`
- `core/queries/LedgerQueries.js` (100 lines) is **imported by nobody** — dead code — while
  `ledger.query.js` is the live one.

Delete the dead layer, merge the rest into a single `core/api/`.

### 3.4 Raw `gql()` calls inside components
`ensureCustomer` embeds GraphQL strings directly in `pos-module.jsx`, bypassing the
query-class + cache convention. Every such call is un-cached and un-invalidated.

### 3.5 Unbounded list queries
`ListItemsQuery` fetches **every item** with no pagination and no filter, cached for 60 s.
At 10 000 SKUs that is a multi-megabyte payload on every screen mount. `pharmaSales` is the same.
**Fix:** server-side paging + search, plus a lightweight `posItemLookup(term, limit)` for billing.

### 3.6 Client-side bill numbering (race condition)
`pos-module.jsx:563` computes the next bill number by downloading **all sales** and taking
`max + 1`, cross-checked against `localStorage`. Two counters billing simultaneously **will**
collide. **Fix:** the server allocates the number inside the sale transaction, from a
`PosDocumentSeries` entity with per-company, per-series, per-fiscal-year counters — which you
also need for GST-legal invoice numbering.

---

## 4. UI / UX — why it does not feel professional

| Problem | Evidence | Fix |
|---|---|---|
| Native `alert()` / `confirm()` blocking dialogs | **162** across the dashboard | `sonner` is already a dependency — one `toast()` + one `<ConfirmDialog>` |
| Zero toast usage | 0 hits | mount `<Toaster/>` once in the dashboard layout |
| No design tokens, no shared layout | each of 20 modules hand-rolls spacing, colours, tables | build `src/components/pos/`: `PageHeader`, `DataTable`, `EntryGrid`, `FormRow`, `ActionBar`, `StatusBadge` |
| `page.jsx` is 57 KB with `UserManagementModule` inline | 1 file, ~1 400 lines | split into a dashboard layout + separate route modules |
| Everything is `.jsx`, zero `.tsx`, despite a `tsconfig` and `codegen` config | 160 jsx / 0 tsx | at minimum generate types from the GraphQL schema and typecheck the API layer |
| No loading skeletons / empty states / error boundaries in most modules | — | standardise through the shared primitives |
| `window.confirm("Do you want to print it?")` after every single bill | `pos-module.jsx:544` | non-blocking post-save action bar; print behaviour is a setting, not a question |
| Mixed UI libraries (antd used only in `dashboard-module.jsx`) | 1 file | drop antd, use shadcn everywhere |

---

## 5. Keyboard & focus — the specific complaint, measured

Enter-key handlers / `.focus()` calls per module:

```
pos-module        9 / 16   ← the only genuinely keyboard-driven screen
payment-module    2 /  2
purchase-module   1 /  1
settings-module   1 /  1
item-master       0 /  3
token-entry       0 /  1
ALL 14 OTHERS     0 /  0   ← no keyboard navigation whatsoever
```

Even in `pos-module` the technique is ad-hoc: `document.getElementById('disc-input')?.focus()`
with hardcoded element ids and `setTimeout(..., 30)`. It cannot be reused, tested, or configured.

### The fix — a focus-flow system
Build `src/hooks/useFieldFlow.js` plus a `<FieldFlowProvider>`:

```js
const flow = useFieldFlow(['code', 'qty', 'rate', 'disc', 'save']);
<input {...flow.field('code')} />   // registers the ref and wires onKeyDown
```

Behaviour every counter operator expects:
- **Enter** → commit the current field, move to the next in sequence (never submits the form)
- **Shift+Enter** → previous field
- **Focus = select-all**, so typing overwrites
- **Down / Up arrow inside a grid** → same column, next / previous row
- **Enter on the last cell of a row** → create a new row, focus column 1
- **Esc** → cancel the current field edit / close the popup
- **F-keys** → global actions, declared once in a central `SHORTCUTS` map, rendered in a footer
  hint bar and an F1 cheat-sheet
- **Autofocus the first field** on module mount; **restore focus** after any modal closes
- The whole app must be operable **without a mouse** — that is the acceptance test

Then apply it across all 20 modules. Mechanical once the hook exists (~1–2 days per 5 modules).

---

## 6. API normalization — the concrete numbers

### Today: "save one bill" = **7 round trips**
| # | Call | Where |
|---|---|---|
| 1 | `customers(filter: { phoneNumber })` | `ensureCustomer` — inline gql |
| 2 | `createCustomer` | `ensureCustomer` |
| 3 | `createPharmaSale` | `pos-module.jsx:508` |
| 4 | `createLedger` (credit sales only) | `pos-module.jsx:527` |
| 5 | `pharmaSales` — the **entire sales list**, only to compute `billNo + 1` | `pos-module.jsx:563` |
| 6 | `pharmaSale(id)` | `InvoicePreviewModal` |
| 7 | `posCompanies` | `InvoicePreviewModal` |

### Today: "save one item" = **4 round trips**, non-transactional
`createPharmaItem` → `createProduct` → `createProductVariants` → `pharmaItems` (re-list)

### Today: "open the POS screen" = **3+ round trips**
`pharmaItems` (ALL items) + `posTaxMasters` + `pharmaSales` (ALL sales)

### Target: one call per process

```graphql
# ── Screen load: one query per screen ──────────────────────────────
query PosBootstrap($counterId: ID!) {
  posBootstrap(counterId: $counterId) {
    company            # replaces posCompanies
    taxMasters         # replaces posTaxMasters
    settings           # replaces localStorage print/config
    printerProfiles
    nextBillNo         # replaces downloading every sale
    itemIndexVersion   # client caches items; refetch only when the version changes
  }
}

# ── Billing: one transactional mutation ────────────────────────────
mutation CommitPosSale($input: CommitPosSaleInput!) {
  commitPosSale(input: $input) {   # server does, inside ONE DB transaction:
    sale { ... }                   #   1. upsert the customer by phone
    invoice { ... }                #   2. allocate the bill no from PosDocumentSeries
    ledgerEntry { ... }            #   3. insert the sale + its lines
    stockMovements { ... }         #   4. write stock ledger + snapshot
  }                                #   5. post the AR ledger entry if credit
}                                  #   6. post the double-entry journal (Phase 4)
                                   #   7. return the fully-built invoice model

# ── Item master: one transactional mutation ────────────────────────
mutation CommitItemMaster($input: CommitItemMasterInput!) {
  commitItemMaster(input: $input) { item { ... } vendureProductId }
}
```

**Result: bill save 7 → 1, item save 4 → 1, screen load 3 → 1.**

### The rule to adopt going forward
> **One user action = one network call.** The server owns the transaction boundary.
> The client never orchestrates multi-step writes.

Also required:
- **Server-side search and paging on every list** (`posItemLookup(term, limit)`), so the client
  stops downloading whole tables.
- **Delete the dead layer** (`LedgerQueries.js`), fold `PosQueries.js` into the unified API layer,
  and add an ESLint rule banning raw `gql()` inside `src/app/**`.
- Keep `cachedFetch` — it is well built — but give every key an explicit TTL and a named
  invalidation owner.

---

## 7. Recommended phase plan

> This supersedes nothing in `PROJECT_ROADMAP.md` — it **re-orders** it. The roadmap's M1
> (data-loss fixes) still comes first among feature work. Phases 0 and 2 below are new and were
> not in the roadmap.

### Phase 0 — Foundations (2 weeks) · do this before anything else
Building features on the current base multiplies the cleanup cost later.
1. `useFieldFlow` hook + central `SHORTCUTS` map + footer hint bar.
2. Shared UI primitives in `src/components/pos/` (`PageHeader`, `DataTable`, `EntryGrid`,
   `FormRow`, `ActionBar`, `ConfirmDialog`, `toast`).
3. Replace all 162 `alert`/`confirm` calls with toast + `ConfirmDialog`.
4. Unified API layer `src/core/api/` — delete `LedgerQueries.js`, absorb `PosQueries.js`,
   ESLint-ban raw `gql()` in `app/**`.
5. `PosDocumentSeries` entity — server-allocated document numbers.
6. Unified print transport `core/print/transport.js` + `PosPrinterProfile` entity.

**Exit criterion:** one module (pick `token-entry`, the smallest) fully rebuilt on the new
primitives with complete keyboard flow, as the reference implementation everyone else copies.

### Phase 1 — Stop the bleeding (1.5 weeks) — *roadmap M1, unchanged*
Stock Adjustment (BUG-001 / BUG-003), Purchase Return (BUG-002), GST report UI, delete dead
masters. **Plus:** remove the silent `catch` around the credit-sale ledger write.

### Phase 2 — Process consolidation (2 weeks) · new
1. `posBootstrap` query.
2. `commitPosSale` transactional mutation (moves `ensureCustomer` server-side).
3. `commitItemMaster` transactional mutation.
4. Server-side paging / search on items, sales, purchases, customers.
5. QZ direct print for invoices + the ESC/POS raw thermal path.

**Exit criterion:** the billing screen makes 1 call to load and 1 to save, verified in the
DevTools network tab.

### Phase 3 — Core POS completion (3 weeks) — *roadmap M2, extended*
PO + convert, Sales Return, Stock Movement viewer, Expenses UI, barcode verification.
**Plus:** GRN / inward backend (has none today), shift & counter open-close + Z-report,
server-persisted hold/recall, price-tier selector in billing, multi-UOM conversion.

### Phase 4 — Accounting engine (8–10 weeks) · the Zoho-Books ask
1. `PosAccountGroup` / `PosAccount` (Chart of Accounts) with a seeded Indian-retail default tree.
2. `PosJournal` / `PosJournalLine` — the posting engine.
3. **Posting rules**: sale, purchase, receipt, payment, expense, return, and adjustment each emit
   a balanced journal. Retro-post existing data with a one-off migration.
4. Bank & cash accounts + a reconciliation screen.
5. Fiscal year, opening balances, period lock.
6. Reports: Trial Balance → P&L → Balance Sheet → Cash Flow.
7. Credit Note / Debit Note as accounting documents.
8. Stock valuation (Weighted Average first, FIFO later) — required before P&L means anything.

### Phase 5 — Enterprise (*roadmap M3*)
Warehouse & branch masters, stock transfers, approval workflows, notifications, audit log.

### Phase 6 — Plugin architecture (*roadmap M4*)
Core extraction, module registry, then the Restaurant / Pharmacy / Service / Manufacturing verticals.

### Phase 7 — Launch (*roadmap M5*)
Production migrations, e-Invoice / e-Way Bill, full GST filing exports, security review, deploy.

---

## 8. Sequencing rationale

- **Phase 0 before Phase 1** — every module touched in Phase 1 would otherwise be rewritten again
  during Phase 0. Build the primitives first and every later phase gets cheaper.
- **Phase 2 before Phase 3** — new modules built on the old N-call pattern would need the same
  consolidation later. Establish the `commit*` mutations first, then build on them.
- **Phase 4 last among the functional phases** — the posting engine consumes sale / purchase /
  return documents, so those must be stable and transactional (Phases 2 and 3) before you post
  from them.
- **e-Invoice deferred to Phase 7** — it is a wrapper around a correct invoice, and the invoice
  model has to be final first.

---

## 9. Open decisions for the owner

1. **Accounting depth** — full double-entry (Zoho parity, ~10 weeks), or an "accounting-lite"
   layer that derives Trial Balance / P&L from existing documents (~3 weeks)?
2. **Offline-first billing** — critical for retail on unreliable internet, but a major
   architectural commitment (local queue + sync + conflict resolution). In scope or out?
3. **e-Invoice / e-Way Bill** — only required above a turnover threshold. Who are the target customers?
4. **TypeScript migration** — full migration, or types on the API layer only?
5. **Phase 0 duration** — two weeks with no visible new features. Acceptable?
