# Test Cases Register

> Test cases drawn from the task cards in [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md). M1–M2 detailed; M3–M5 high-level (expand at kickoff). Update **Status** as run: ⬜ Not Run · ✅ Pass · ❌ Fail.

**How to verify server persistence:** after a UI save, confirm the record via the module's list refresh **and** independently in GraphiQL (`/graphiql`) / the relevant `pos*`/`pharma*` query, plus the stock effect via `posStockLedger` where applicable.

---

## Milestone 1

### Sprint 1.1 — Stock Adjustment
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-1.1-1 | An item with known current stock | Add +5, Save | Server row via `posStockAdjustments`; `posStockLedger` shows ADD; current stock +5 | ⬜ |
| TC-1.1-2 | `allowNegativeStock=false`; item stock < reduce qty | Reduce beyond stock, Save | Server error surfaced in UI; no partial write; stock unchanged | ⬜ |
| TC-1.1-3 | Multiple items | Enter adjustments on 3 items, Save | All 3 persist to server | ⬜ |
| TC-1.1-4 | Adjustments saved earlier | Reload page | Recent log loaded from server (not localStorage) | ⬜ |
| TC-1.1-5 | Any item listed | Observe "Current" column | Shows real current stock, not `minStkQty` | ⬜ |

### Sprint 1.2 — Purchase Return
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-1.2-1 | Supplier + items | Enter a return, Save | Appears via `posPurchaseReturns` | ⬜ |
| TC-1.2-2 | Item with stock | Save a return line | `posStockLedger` reflects stock reduction | ⬜ |
| TC-1.2-3 | Returns saved earlier | Reload | "Recent Returns" loaded from server | ⬜ |

### Sprint 1.3 — GST Reports
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-1.3-1 | Sales exist in range | Open GSTR-1, pick range | HSN rows + totals render | ⬜ |
| TC-1.3-2 | Sales/purchases in range | Open GSTR-3B, pick range | Outward + ITC + net render | ⬜ |
| TC-1.3-3 | Same range | Compare GSTR totals vs `gstReport` | Totals reconcile | ⬜ |
| TC-1.3-4 | Range with no data | Pick empty range | Clean empty state, no crash | ⬜ |
| TC-1.3-5 | Report loaded | Export PDF | PDF opens with data | ⬜ |

### Sprint 1.4 — Cleanup
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-1.4-1 | Repo checkout | `grep` for `master-modules` import | No remaining importer | ⬜ |
| TC-1.4-2 | After deletion | `next build` / `check-types` | Pass, no errors | ⬜ |
| TC-1.4-3 | App running | Load dashboard | No console error; removed tabs absent | ⬜ |
| TC-1.4-4 | Stock-updation module | Open it | Header relabeled "Min Stock / Reorder Qty"; still saves `minStkQty` | ⬜ |

---

## Milestone 2

### Sprint 2.1 — Purchase Order
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-2.1-1 | Supplier + items | Create PO | Appears in list as OPEN | ⬜ |
| TC-2.1-2 | An OPEN PO | Click Convert to Purchase | New `PharmaPurchase` created; PO → CONVERTED; purchases list refreshed | ⬜ |
| TC-2.1-3 | An OPEN PO | Cancel | PO → CANCELLED; convert disabled | ⬜ |
| TC-2.1-4 | A CONVERTED PO | Attempt convert again | Blocked | ⬜ |

### Sprint 2.2 — Sales Return
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-2.2-1 | A sale exists | Search customer → pick sale → full return | Stock increases; ledger reflects | ⬜ |
| TC-2.2-2 | Sale partially returned | Return again | Second return caps at new `remainingQty` | ⬜ |
| TC-2.2-3 | Any sale | Enter `returnQty` > remaining | Blocked client + server | ⬜ |
| TC-2.2-4 | Any sale | Submit | `originalSaleId` sent as number (no type error) | ⬜ |

### Sprint 2.3 — Stock Ledger viewer
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-2.3-1 | Item with movement history | Select item | Rows ordered; running balance consistent | ⬜ |
| TC-2.3-2 | Item with mixed refTypes | Filter by refType | List filtered | ⬜ |
| TC-2.3-3 | Item with no movement | Select it | Empty state | ⬜ |
| TC-2.3-4 | Known-good data | Open integrity panel | Reflects invariant (holds) | ⬜ |

### Sprint 2.4 — Barcode
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-2.4-1 | Item without barcode | Generate | EAN-13 assigned | ⬜ |
| TC-2.4-2 | Several without barcodes | Bulk generate-missing | All assigned | ⬜ |
| TC-2.4-3 | QZ Tray running | Print label | Prints directly; when QZ down → browser fallback | ⬜ |
| TC-2.4-4 | Generated barcode | Scan in POS | Resolves the correct item | ⬜ |

### Sprint 2.5 — Expenses
| ID | Precondition | Steps | Expected | Status |
|---|---|---|---|---|
| TC-2.5-1 | — | Create expense category | Appears in voucher dropdown | ⬜ |
| TC-2.5-2 | Category exists | Create expense voucher | Appears in `posExpenses(from,to)` | ⬜ |
| TC-2.5-3 | Voucher exists | Open Expense Report | Shows the voucher | ⬜ |
| TC-2.5-4 | GST-applied voucher | Save | Tax field computed | ⬜ |

---

## Milestone 3 *(high-level — expand at kickoff)*
| ID | Area | Expected | Status |
|---|---|---|---|
| TC-3.1-1 | Warehouse | Stock movement tagged to warehouse; per-warehouse snapshot correct; invariant holds | ⬜ |
| TC-3.2-1 | Branch transfer | Reduces source, increases destination; both ledgers balance | ⬜ |
| TC-3.3-1 | Approval | Unapproved doc not actioned; approver role enforced; approval audited | ⬜ |
| TC-3.4-1 | Notifications | Low-stock/expiry/approval events raise deliverable, dismissible notifications | ⬜ |

## Milestone 4 *(high-level — expand at kickoff)*
| ID | Area | Expected | Status |
|---|---|---|---|
| TC-4.0-1 | Core extraction | Full M1–M2 regression passes; no removed/renamed public GraphQL ops; toggle hides a module cleanly | ⬜ |
| TC-4.x-1 | Each vertical | Enable → screens work on core data; disable → cleanly gone; core regression unaffected | ⬜ |

## Milestone 5 *(high-level — pre-launch)*
| ID | Area | Expected | Status |
|---|---|---|---|
| TC-5.1-1 | Migrations | Fresh DB reproduces schema; existing DB upgrades without data loss; app boots | ⬜ |
| TC-5.2-1 | GST filing | Downloads match server; sections reconcile with summary; portal JSON schema-valid | ⬜ |
| TC-5.3-1 | Deploy/security | Compose boots; auth/permissions verified; no critical security findings | ⬜ |
