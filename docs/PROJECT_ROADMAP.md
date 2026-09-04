# Enterprise POS ERP — Project Roadmap

> **STATUS: FROZEN.** This roadmap is the single source of truth. Do not reorder tasks or introduce new features unless the project owner explicitly requests a change. All future work follows this document.
>
> **Change control:** any change to scope, order, or task definition must be requested explicitly and recorded here (add a dated entry to the Change Log at the bottom) before work proceeds.

## Context

`d:\POS_API` is a **Vendure 3.5.5** backend (NestJS/TypeORM/GraphQL, MySQL `wow_vendurepos`) + a **Next.js 16** app. Custom ERP lives in three Vendure plugins — `pos-auth`, `ledger`, `pharma` (the misnamed generic-retail core). The client POS/ERP is a single-page tab switcher at `Client/src/app/dashboard/page.jsx`.

**End goal:** a plugin-based, multi-vertical Enterprise POS ERP — an industry-independent **Core** with verticals (Restaurant, Pharmacy, Service, Manufacturing…) as enable/disable modules that never modify core.

**Plan-shaping finding:** substantial backend already exists with no UI, and several UI modules are `localStorage` stubs sitting on real backends — **silently dropping data**. Highest ROI = connect and de-duplicate what exists before building new modules.

### Reusable patterns (apply in every client task)
- **Query/Command class** (`Client/src/core/queries/pharma.query.js`, model `CreatePaymentCommand`/`ListPaymentsQuery`): list uses `cachedFetch(key, fn, TTL)`, maps `rowsJson`→`rows`; command uses `gql(..., {useAdmin:true, variables:{input}})` then `invalidateCache(key)`. **All calls `useAdmin:true`.**
- **Module shell** (new `Client/src/app/dashboard/<x>-module.jsx`, model `payment-module.jsx`): `"use client"` + `useEffect(loadAll)` + `handleSave` try/catch → command → reload → alert.
- **Nav wiring** (`page.jsx`): icon+module import; `case 'x'` in `renderContent()`; entry in `adminMenuItems` (menu entry = reachability). **Reports:** query class in `reports.query.js` + descriptor in `report-registry.js` + `reportSubitems` line.
- Server shapes authoritative in `Server/src/plugins/pharma/api/pharma.api.ts` (reference only; no server edits in M1–M2).

---

## Roadmap overview

| Milestone | Theme | Detail level |
|---|---|---|
| **M1** | Project Stabilization | Full task cards (execute now) |
| **M2** | Core POS Completion | Full task cards (execute now) |
| **M3** | Enterprise Features | Coarse — re-plan at kickoff |
| **M4** | Plugin Architecture | Coarse — re-plan at kickoff |
| **M5** | Deployment / Testing / Documentation | Coarse — pre-launch |

Complete each milestone's exit criteria before starting the next.

---

# MILESTONE 1 — Project Stabilization

Fix the data-loss bugs and remove confusion. Client wiring only (no server edits). Existing backends already support all of this.

### Sprint 1.0 — Safe baseline *(prerequisite)*
- **Objective:** Lock a rollback point before any change.
- **Files to modify:** none (git branch e.g. `feat/stabilization` + DB dump of `wow_vendurepos`).
- **Expected outcome:** Clean branch off `main`; DB backup; both apps boot (`Server npm run dev`, `Client npm run dev` :3001); login works.
- **Dependencies:** none.
- **Risk:** Low.
- **Test cases:** `/graphiql` reachable; `/login`→`/dashboard` renders; `git status` clean.
- **Rollback plan:** delete branch; restore DB dump.
- **Completion checklist:** ☐ branch ☐ DB dump ☐ both apps boot ☐ baseline tagged.

### Sprint 1.1 — Stock Adjustment *(data-loss fix — BUG-001, BUG-003)*
- **Objective:** Persist adjustments via `createPosStockAdjustment` and affect real stock, replacing the `localStorage` stub.
- **Files to modify:** `pharma.query.js` (add `ListStockAdjustmentsQuery`→`posStockAdjustments`, `CreateStockAdjustmentCommand`→`createPosStockAdjustment`); `stock-adjustment-module.jsx` (replace localStorage `save()` L21-38 + log load L16; fix "Current" display L63 which wrongly shows `minStkQty`); `page.jsx` (add `adminMenuItems` entry — route exists, menu missing).
- **Expected outcome:** Each line calls the mutation (one adjustment per item — loop) with `itemCode: it.code`, `adjType:'ADD'|'REDUCE'`, `adjustQty`, generated `adjNo`, `adjDate`; recent log from server; reachable from sidebar.
- **Dependencies:** 1.0.
- **Risk:** Low (no warehouse/counter args; server validates negative stock).
- **Test cases:** (1) +5 → server row + `posStockLedger` movement + stock +5. (2) Reduce beyond stock (allowNegativeStock=false) → server error surfaced, no partial write. (3) Multi-item save all persist. (4) Reload → log server-sourced.
- **Rollback plan:** `git revert` task commit (no schema change).
- **Completion checklist:** ☐ query classes ☐ save() server-backed ☐ current-stock display fixed ☐ menu entry ☐ 4 tests pass ☐ no localStorage write.

### Sprint 1.2 — Purchase Return *(data-loss fix — BUG-002)*
- **Objective:** Persist returns via `createPosPurchaseReturn`, replacing the `localStorage` stub.
- **Files to modify:** `pharma.query.js` (add `ListPurchaseReturnsQuery`→`posPurchaseReturns`, `CreatePurchaseReturnCommand`→`createPosPurchaseReturn`); `purchase-return-module.jsx` (replace localStorage `save()` L41-53); `page.jsx` (menu entry).
- **Expected outcome:** Existing `{itemCode,itemName,batchNo,qty,rate,amount}` rows pass through as `rows` JSON with `retNo`, `retDate`, `supplier`, `reason`, totals; "Recent Returns" from server.
- **Dependencies:** 1.0 (parallel with 1.1).
- **Risk:** Low.
- **Test cases:** (1) Save → appears via `posPurchaseReturns`. (2) Stock effect via `posStockLedger`. (3) Reload → server-sourced.
- **Rollback plan:** `git revert` (no schema change).
- **Completion checklist:** ☐ query classes ☐ save() server-backed ☐ menu entry ☐ tests pass ☐ no localStorage write.

### Sprint 1.3 — GST Reports (GSTR-1 & GSTR-3B summary)
- **Objective:** Expose existing `gstr1Report`/`gstr3bReport` as on-screen summary reports.
- **Files to modify:** `reports.query.js` (add `Gstr1ReportQuery`, `Gstr3bReportQuery`); `report-registry.js` (two `needsDateRange:true` descriptors — gstr1: rows `d.hsn`, summary `d.totals`; gstr3b: rows `[...outward,...itc,netTaxPayable]`, summary `netTaxPayable`); `page.jsx` (`reportSubitems`).
- **Expected outcome:** Two reports in submenu; date range → summary table + KPI band; PDF export via existing builder.
- **Dependencies:** 1.0.
- **Risk:** Low–Medium (registry is flat: summary/HSN only — full B2B/CDNR sections + portal-JSON/CSV downloads deferred to M5).
- **Test cases:** (1) GSTR-1 HSN rows + totals render. (2) GSTR-3B outward/ITC/net render. (3) Totals reconcile vs `gstReport`. (4) Empty range clean. (5) PDF opens.
- **Rollback plan:** `git revert` (additive).
- **Completion checklist:** ☐ 2 query classes ☐ 2 descriptors ☐ 2 submenu entries ☐ totals reconcile ☐ PDF works.

### Sprint 1.4 — Cleanup *(BUG-005, BUG-006, BUG-007)*
- **Objective:** Delete unreachable/misleading dead code; end the stock-updation mislabel.
- **Files to modify:** delete `master-modules.jsx`; `page.jsx` (remove import L23 + 7 switch cases L373-379); `stock-updation-module.jsx` (relabel header L57-58 → "Min Stock / Reorder Qty").
- **Expected outcome:** No dead masters (incl. fake duplicate TaxMaster); stock-updation clearly labeled (it already correctly hits the server).
- **Dependencies:** 1.0. **Precondition:** `grep` confirms no other importer of `master-modules.jsx`.
- **Risk:** Low (cases unreachable — no menu entries).
- **Test cases:** (1) grep clean. (2) `check-types`/`next build` pass. (3) App loads, no console error, tabs absent. (4) Relabel visible; still saves `minStkQty`.
- **Rollback plan:** `git revert` restores files from history.
- **Completion checklist:** ☐ grep clean ☐ file deleted ☐ import+cases removed ☐ build passes ☐ relabel done.

**M1 exit criteria:** ☐ 1.0–1.4 merged ☐ two data-loss bugs proven fixed (server persistence + stock movement) ☐ GST summaries reconcile ☐ build green ☐ regression pass on POS billing/purchase/payment/receipt/ledger ☐ `/code-review` clean.

---

# MILESTONE 2 — Core POS Completion

Surface the orphaned backends and round out the core POS domains. Client wiring only (no server edits). Organized by domain.

### Sprint 2.1 — Purchase (Purchase Order + convert)
- **Objective:** UI for `createPosPurchaseOrder` + `convertPosPurchaseOrderToPurchase`.
- **Files to modify:** `pharma.query.js` (`ListPurchaseOrdersQuery`, `CreatePurchaseOrderCommand`, `ConvertPurchaseOrderCommand` → invalidates `pharma:purchases`); new `purchase-order-module.jsx`; `page.jsx` (import+case+menu).
- **Expected outcome:** Create PO (header + row grid); list with status badge (OPEN/CONVERTED/CANCELLED); "Convert to Purchase" on OPEN creates a real `PharmaPurchase`.
- **Dependencies:** M1; grid pattern from 1.2.
- **Risk:** Medium.
- **Test cases:** (1) Create → OPEN. (2) Convert → new `PharmaPurchase`, PO→CONVERTED, purchases refreshed. (3) Cancel → CANCELLED, no convert. (4) Double-convert blocked.
- **Rollback plan:** `git revert` (additive).
- **Completion checklist:** ☐ 3 query classes ☐ module ☐ nav ☐ convert works ☐ status transitions correct.
- *Note:* real `inward-module` backend (goods receipt) is missing server-side → deferred to M5 backlog, not built here.

### Sprint 2.2 — Sales (Sales Return)
- **Objective:** UI for `pharmaSalesByCustomer` → `getSaleForReturn` → `createPosSalesReturn`.
- **Files to modify:** `pharma.query.js` (`SalesByCustomerQuery`, `GetSaleForReturnQuery`, `CreateSalesReturnCommand`, `ListSalesReturnsQuery`); new `sales-return-module.jsx`; `page.jsx` (import+case+menu).
- **Expected outcome:** Search customer/bill → pick sale → lines show `remainingQty` as max → enter `returnQty` (clamp ≤ remaining) → submit with `originalSaleId` as **`Int`**; recent-returns list.
- **Dependencies:** M1; reuse `payment-module` search-popup.
- **Risk:** Medium (`Int!` id; clamp).
- **Test cases:** (1) Full return → stock up, ledger reflects. (2) Partial then second caps at new remaining. (3) Over-return blocked client+server. (4) id sent as number.
- **Rollback plan:** `git revert` (additive).
- **Completion checklist:** ☐ 4 query classes ☐ module ☐ nav ☐ clamp ☐ Int id ☐ tests pass.

### Sprint 2.3 — Inventory (Stock Ledger / Movement viewer)
- **Objective:** Read-only UI for `posStockLedger` (+ optional integrity report).
- **Files to modify:** `pharma.query.js` (`StockLedgerQuery(itemCode,refType,limit)`, optional `StockIntegrityReportQuery`); new `stock-movement-module.jsx`; `page.jsx` (import+case+menu).
- **Expected outcome:** Item search (reuse `ListItemsQuery`) → movement table (date, refType, refNo, qty ±, runningBalance, reason); optional integrity panel.
- **Dependencies:** M1; best after 1.1 (adjustments create ledger rows).
- **Risk:** Low (read-only).
- **Test cases:** (1) Item w/ history → ordered rows, running balance consistent. (2) Filter by refType. (3) No-movement item → empty state. (4) Integrity panel reflects invariant.
- **Rollback plan:** `git revert` (additive, read-only).
- **Completion checklist:** ☐ query class(es) ☐ module ☐ nav ☐ balance correct ☐ no writes.

### Sprint 2.4 — Barcode (verify & harden)
- **Objective:** Validate the already-complete barcode/label system end-to-end; close any gaps rather than rebuild.
- **Files to modify:** likely none/minor — `barcode-module.jsx`, `Client/src/core/barcode/*` (only if a gap is found).
- **Expected outcome:** WYSIWYG designer, EAN-13 generation (`generatePosItemBarcode`), label PDF (pdfmake), and QZ Tray direct printing all confirmed working; any missing-barcode bulk assign verified.
- **Dependencies:** M1.
- **Risk:** Low.
- **Test cases:** (1) Generate barcode for an item lacking one. (2) Bulk generate-missing. (3) Print label via QZ Tray; browser fallback when QZ down. (4) Scan generated barcode in POS resolves the item.
- **Rollback plan:** `git revert` any fix (additive).
- **Completion checklist:** ☐ generation verified ☐ label PDF verified ☐ QZ + fallback verified ☐ scan round-trip ☐ gaps logged/fixed.

### Sprint 2.5 — Reports (Expenses entry → Expense Report)
- **Objective:** Add expense category/item/voucher UI so the already-registered Expense Report populates; surface remaining report backends.
- **Files to modify:** `pharma.query.js` (category/item/voucher list+create classes for `posExpenseCategories`/`posExpenseItems`/`posExpenses`); new `expense-module.jsx` (3 tabs); `page.jsx` (import+case+menu). Optional: surface `posStockReconciliation` as a report descriptor.
- **Expected outcome:** Create categories/items, enter vouchers (`createPosExpense`); Expense Report shows data.
- **Dependencies:** M1. Do last in M2 (largest).
- **Risk:** Medium–High (3 CRUD flows).
- **Test cases:** (1) Category → appears in voucher dropdown. (2) Voucher → in `posExpenses(from,to)`. (3) Expense Report populated. (4) GST-applied voucher computes tax.
- **Rollback plan:** `git revert` (additive).
- **Completion checklist:** ☐ 3 CRUD flows ☐ module 3 tabs ☐ nav ☐ report populates ☐ tests pass.

**M2 exit criteria:** ☐ 2.1–2.5 merged ☐ each new record proven via GraphiQL + list refresh ☐ PO convert produces `PharmaPurchase` ☐ sales-return clamp verified ☐ barcode round-trip verified ☐ build green ☐ regression + `/code-review` clean.

---

# MILESTONE 3 — Enterprise Features
*Coarse — net-new, needs server work; re-plan into full task cards at kickoff.*

Prerequisite note: Branch/Warehouse are currently just labels, though `PosStockLedger`/`PosItemStockSnapshot` already carry a `warehouseId` column (partially seeded) — leverage it rather than redesigning stock.

### Sprint 3.1 — Warehouse & Branch masters
- **Objective:** Real Warehouse + Branch master entities/UI; wire existing `warehouseId` on stock.
- **Files to modify:** new server entity/resolver (in current `pharma`/future `core` plugin); client master module + nav; extend stock write path to honor selected warehouse.
- **Expected outcome:** Stock, sales, purchases attributable to a branch/warehouse.
- **Dependencies:** M2 stable. **Risk:** High (touches stock choke-point `writeLedger`).
- **Test cases:** create warehouse; stock movement tagged; per-warehouse snapshot correct; invariant holds per warehouse.
- **Rollback plan:** feature-flag branch scoping; keep default single-warehouse path; DB dump before schema change.
- **Completion checklist:** ☐ entities ☐ UI ☐ stock honors warehouse ☐ invariant per warehouse ☐ regression green.

### Sprint 3.2 — Multi-Branch operations
- **Objective:** Branch-scoped data + stock/branch transfers (currently missing).
- **Files/Deps/Risk:** new transfer entity + UI; depends 3.1; **High**.
- **Test cases:** transfer reduces source, increases destination, both ledgers balance.
- **Rollback plan:** revert on branch; DB dump. **Checklist:** ☐ transfer entity ☐ UI ☐ dual-ledger balance ☐ regression.

### Sprint 3.3 — Approval workflows
- **Objective:** Approval gates (e.g. PO, stock adjustment) with status + role checks.
- **Files/Deps/Risk:** status fields + resolver guards + client status UI; depends M2; **Medium**.
- **Test cases:** unapproved doc not actioned; approver role enforced; audit trail of approval.
- **Rollback plan:** flag off approvals → direct action. **Checklist:** ☐ status model ☐ role guard ☐ UI ☐ tests.

### Sprint 3.4 — Notifications
- **Objective:** In-app + email notifications (Vendure `email-plugin` already present).
- **Files/Deps/Risk:** notification entity/service + client toaster/inbox; **Medium**.
- **Test cases:** low-stock/expiry/approval events raise notifications; delivered + dismissible.
- **Rollback plan:** flag off. **Checklist:** ☐ events ☐ delivery ☐ UI ☐ tests.

---

# MILESTONE 4 — Plugin Architecture
*Coarse — foundational refactor + verticals; re-plan at kickoff. Preserve backward compatibility.*

### Sprint 4.0 — Foundation (prerequisite for all verticals)
- **Objective:** Extract industry-independent **Core** plugin (rename `pharma`→`core`, move `PharmaToken`/vertical bits out; keep GraphQL op names stable). Build a **module registry + capability toggles** (promote client `pharma_config_properties`→`isSectionEnabled` into a first-class registry with server flags + menu/route gating).
- **Files to modify:** `Server/src/plugins/pharma/**`→`core`, `vendure-config.ts`; `page.jsx` menu/`renderContent()`; `settings-module.jsx` toggles.
- **Expected outcome:** Core holds shared functionality; verticals enable/disable without core edits; public API names unchanged.
- **Dependencies:** M1–M3. **Risk:** High.
- **Test cases:** full M1–M2 regression; GraphiQL schema diff shows no removed/renamed public ops; toggle hides a module cleanly.
- **Rollback plan:** dedicated branch; keep table names stable (DB untouched); tag pre-refactor.
- **Completion checklist:** ☐ core plugin builds ☐ registry ☐ toggle gating ☐ op names stable ☐ full regression.

### Sprints 4.1–4.4 — Verticals (each: own plugin + client bundle, registry-gated, zero core edits)
- **4.1 Restaurant** — KOT, kitchen display, table management, captain order, combos.
- **4.2 Pharmacy** — prescriptions, doctor master, drug schedules, per-lot batch/expiry, near-expiry.
- **4.3 Service** — job card, technician allocation, warranty, AMC, service history.
- **4.4 Manufacturing** — BOM, production order, material consumption, finished goods.
- **Per vertical — Objective:** deliver the vertical as an isolated plugin reusing core services/entities. **Files:** new `Server/src/plugins/<vertical>/**` + `Client/src/app/dashboard/<vertical>/**` + registry entry. **Deps:** 4.0; vertical order confirmed with owner. **Risk:** Medium–High. **Test cases:** enable → screens work on core data; disable → cleanly gone; core regression unaffected. **Rollback:** remove plugin + registry entry. **Checklist:** ☐ plugin ☐ client bundle ☐ registry-gated ☐ no core edits ☐ regression.

---

# MILESTONE 5 — Deployment / Testing / Documentation
*Coarse — pre-launch hardening.*

### Sprint 5.1 — Production migrations *(resolves flagged DB risk — BUG-010)*
- **Objective:** Generate migrations for all ~25 custom tables; disable `synchronize` in prod.
- **Files:** `Server/src/migrations/**`; `vendure-config.ts`. **Deps:** schema stable (after 4.0 if names changed). **Risk:** High.
- **Test cases:** fresh DB + `migration:run` reproduces schema; existing DB upgrades without data loss; app boots on migrated DB.
- **Rollback plan:** migrations have `down()`; test on DB copy first; keep pre-migration dump.
- **Completion checklist:** ☐ migrations ☐ fresh-DB reproduces ☐ existing-DB safe ☐ synchronize off in prod.

### Sprint 5.2 — Full GST filing/export + end-to-end testing
- **Objective:** Dedicated GSTR-1 section view (B2B/B2CL/B2CS/CDNR/DOCS) + `gstr1PortalJson`/`gstr1Csvs`/`gstr3bCsv` downloads (M1 covered summary only); run full E2E across purchase/sales/POS/inventory/reports/printing/accounting.
- **Files:** new client GST filing module + export query classes. **Deps:** 1.3. **Risk:** Medium.
- **Test cases:** downloads match server; sections reconcile with GSTR-1 summary; portal JSON schema-valid; E2E flows pass.
- **Rollback plan:** `git revert` (additive). **Checklist:** ☐ export classes ☐ section tabs ☐ downloads verified ☐ reconcile ☐ E2E green.

### Sprint 5.3 — Deployment & security
- **Objective:** Prod deploy (Docker/`docker-compose.yml` exist), security review (`/security-review`), performance pass.
- **Deps:** 5.1. **Risk:** Medium.
- **Test cases:** prod build boots via compose; auth/permissions verified; no critical security findings.
- **Rollback plan:** blue/green or prior image. **Checklist:** ☐ compose deploy ☐ security review ☐ perf pass.

### Sprint 5.4 — Documentation & deferred backlog
- **Objective:** Developer + user docs; promote remaining gaps to task cards when scheduled.
- **Deferred backlog items:** server-persisted hold/recall bills (`pos_parked_bills`); real `inward`/goods-receipt backend; audit logs; UI-library consolidation (shadcn vs Ant); split bill; POS coupons/loyalty; Quotation/Sales Order/Delivery Challan; Chart of Accounts/double-entry.
- **Checklist:** ☐ dev docs ☐ user docs ☐ each backlog item carded before work.

---

## Global execution rules
- Finish a milestone's exit criteria before the next. Within M1, 1.1/1.2/1.4 can parallelize; 1.3 independent.
- Every task: branch → implement → `/code-review` the diff → regression on shared touch-points (`pharma.query.js`, `page.jsx`) → `verify` end-to-end (server persistence + stock/ledger effect) → document.
- No business-logic changes unless provably wrong (the data-loss stubs qualify). Preserve backward compatibility and existing GraphQL operation names.
- Server edits are out of scope for M1–M2 (client wiring only); M3–M5 touch the server with migration care and a DB dump beforehand.

---

## Change Log
*(Record every explicitly-approved deviation from this frozen roadmap here.)*

| Date | Change | Requested by | Notes |
|---|---|---|---|
| 2026-07-09 | Roadmap frozen (initial baseline) | Owner | M1–M2 detailed; M3–M5 coarse. |
