# Implementation Checklist

> Aggregated completion checklists for every task in [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md). Check items as they land. Each task also follows the global rule: branch → implement → `/code-review` → regression → `verify` end-to-end → document.

## Milestone 1 — Project Stabilization

### Sprint 1.0 — Safe baseline
- [ ] Working branch created off `main` (e.g. `feat/stabilization`)
- [ ] DB dump of `wow_vendurepos` saved
- [ ] Server + Client both boot; login works
- [ ] Baseline commit/tag noted

### Sprint 1.1 — Stock Adjustment (BUG-001, BUG-003)
- [ ] `ListStockAdjustmentsQuery` + `CreateStockAdjustmentCommand` added to `pharma.query.js`
- [ ] `save()` calls `createPosStockAdjustment` per line (no localStorage)
- [ ] "Current" display fixed (no longer shows `minStkQty`)
- [ ] `adminMenuItems` entry added (module reachable)
- [ ] 4 test cases pass (see TEST_CASES TC-1.1-*)
- [ ] No residual localStorage write

### Sprint 1.2 — Purchase Return (BUG-002)
- [ ] `ListPurchaseReturnsQuery` + `CreatePurchaseReturnCommand` added
- [ ] `save()` server-backed (no localStorage)
- [ ] `adminMenuItems` entry added
- [ ] Test cases pass (TC-1.2-*)
- [ ] No residual localStorage write

### Sprint 1.3 — GST Reports (GSTR-1 / GSTR-3B summary)
- [ ] `Gstr1ReportQuery` + `Gstr3bReportQuery` added to `reports.query.js`
- [ ] 2 registry descriptors added to `report-registry.js`
- [ ] 2 `reportSubitems` entries added to `page.jsx`
- [ ] Totals reconcile with `gstReport`
- [ ] PDF export works

### Sprint 1.4 — Cleanup (BUG-005, BUG-006, BUG-007)
- [ ] `grep` confirms no other importer of `master-modules.jsx`
- [ ] `master-modules.jsx` deleted
- [ ] `page.jsx` import + 7 switch cases removed
- [ ] `check-types` / `next build` pass, no console errors
- [ ] `stock-updation-module.jsx` header relabeled

**M1 exit:** [ ] 1.0–1.4 merged · [ ] data-loss bugs proven fixed · [ ] GST reconcile · [ ] build green · [ ] regression pass · [ ] `/code-review` clean

## Milestone 2 — Core POS Completion

### Sprint 2.1 — Purchase Order (+convert)
- [ ] `ListPurchaseOrdersQuery` + `CreatePurchaseOrderCommand` + `ConvertPurchaseOrderCommand` added
- [ ] `purchase-order-module.jsx` created
- [ ] Nav wired (import + case + menu)
- [ ] Convert produces a real `PharmaPurchase`
- [ ] Status transitions correct (OPEN/CONVERTED/CANCELLED)

### Sprint 2.2 — Sales Return
- [ ] `SalesByCustomerQuery` + `GetSaleForReturnQuery` + `CreateSalesReturnCommand` + `ListSalesReturnsQuery` added
- [ ] `sales-return-module.jsx` created
- [ ] Nav wired
- [ ] `returnQty` clamped ≤ `remainingQty`
- [ ] `originalSaleId` sent as `Int`
- [ ] Test cases pass

### Sprint 2.3 — Stock Ledger / Movement viewer
- [ ] `StockLedgerQuery` (+ optional integrity query) added
- [ ] `stock-movement-module.jsx` created
- [ ] Nav wired
- [ ] Running balance correct
- [ ] Read-only (no writes)

### Sprint 2.4 — Barcode verify & harden
- [ ] Item barcode generation verified
- [ ] Bulk generate-missing verified
- [ ] QZ Tray print + browser fallback verified
- [ ] Scan round-trip resolves item in POS
- [ ] Gaps logged/fixed (if any)

### Sprint 2.5 — Expenses → Expense Report
- [ ] Category/item/voucher list+create classes added
- [ ] `expense-module.jsx` created (3 tabs)
- [ ] Nav wired
- [ ] Voucher entry populates the existing Expense Report
- [ ] Test cases pass

**M2 exit:** [ ] 2.1–2.5 merged · [ ] each new record proven via GraphiQL + list refresh · [ ] PO convert works · [ ] sales-return clamp verified · [ ] barcode round-trip verified · [ ] build green · [ ] regression + `/code-review` clean

## Milestone 3 — Enterprise Features *(re-plan at kickoff)*
- [ ] 3.1 Warehouse & Branch masters — entities · UI · stock honors warehouse · invariant per warehouse · regression
- [ ] 3.2 Multi-Branch operations — transfer entity · UI · dual-ledger balance · regression
- [ ] 3.3 Approval workflows — status model · role guard · UI · tests
- [ ] 3.4 Notifications — events · delivery · UI · tests

## Milestone 4 — Plugin Architecture *(re-plan at kickoff)*
- [ ] 4.0 Foundation — core plugin builds · module registry · toggle gating · op names stable · full regression
- [ ] 4.1 Restaurant — plugin · client bundle · registry-gated · no core edits · regression
- [ ] 4.2 Pharmacy — plugin · client bundle · registry-gated · no core edits · regression
- [ ] 4.3 Service — plugin · client bundle · registry-gated · no core edits · regression
- [ ] 4.4 Manufacturing — plugin · client bundle · registry-gated · no core edits · regression

## Milestone 5 — Deployment / Testing / Documentation *(pre-launch)*
- [ ] 5.1 Migrations generated · fresh-DB reproduces · existing-DB safe · `synchronize` off in prod
- [ ] 5.2 GST export classes · section tabs · downloads verified · reconcile · E2E green
- [ ] 5.3 Compose deploy · security review · perf pass
- [ ] 5.4 Dev docs · user docs · each backlog item carded before work
