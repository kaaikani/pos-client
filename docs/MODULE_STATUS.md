# Module Status Inventory

> Snapshot from the Phase-1 analysis. **Status** legend: ✅ Complete · 🟨 Partial · 🟥 Stub/Broken · 🟦 Backend-only (no UI) · ⬜ Missing. Update as sprints land.

## POS / Billing
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Fast/keyboard billing | POS | ✅ Complete | `dashboard/pos-module.jsx` | — |
| Barcode billing | POS | ✅ Complete | `pos-module.jsx` + `queries/PosQueries.js` | — |
| Multi/split payment | POS | ✅ Complete | `pos-module.jsx` | — |
| Hold / recall bill | POS | 🟨 Partial | `pos-module.jsx` (browser-local) | M5 backlog (BUG-009) |
| Split bill | POS | ⬜ Missing | — | M5 backlog |
| Coupons / Loyalty (POS) | POS | ⬜ Missing | — | M5 backlog |

## Sales
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Sales invoice | Sales | ✅ Complete | `core/invoice/*`, `InvoicePreviewModal.jsx` | — |
| Sales return | Sales | 🟦 Backend-only | server `createPosSalesReturn` (no UI) | 2.2 |
| Quotation | Sales | ⬜ Missing | — | M5 backlog |
| Sales order | Sales | ⬜ Missing | — | M5 backlog |
| Delivery challan | Sales | ⬜ Missing | — | M5 backlog |

## Purchase
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Purchase entry | Purchase | ✅ Complete | `purchase-module.jsx` | — |
| Purchase list | Purchase | ✅ Complete | `purchase-list-module.jsx` | — |
| Supplier payments | Purchase | ✅ Complete | `payment-module.jsx` | — |
| Purchase order (+convert) | Purchase | 🟦 Backend-only | server `PosPurchaseOrder` (no UI) | 2.1 |
| Purchase return | Purchase | 🟥 Stub/Broken | `purchase-return-module.jsx` (localStorage) | 1.2 |
| Goods receipt / inward | Purchase | 🟥 Stub (no backend) | `inward-module.jsx` | M5 backlog (BUG-004) |

## Inventory
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Current stock view | Inventory | ✅ Complete (read-only) | `inventory-module.jsx` | — |
| Stock adjustment | Inventory | 🟥 Stub/Broken | `stock-adjustment-module.jsx` (localStorage) | 1.1 |
| Stock ledger / movement | Inventory | 🟦 Backend-only | server `posStockLedger` (no UI) | 2.3 |
| Min-stock / reorder (mislabeled "updation") | Inventory | 🟨 Partial | `stock-updation-module.jsx` | 1.4 (relabel) |
| Opening stock | Inventory | 🟨 Partial | item fields (Item Master) | — |
| Batch/serial/expiry | Inventory | 🟨 Partial (field-level, no per-lot entity) | `pharma-item.entity.ts` | M4.2 (Pharmacy) |
| Stock transfer | Inventory | ⬜ Missing | — | 3.2 |

## Masters
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Item / Product | Master | ✅ Complete | `item-master-module.jsx` (+Vendure sync) | — |
| Customer | Master | ✅ Complete | `customer-module.jsx` (Vendure) | — |
| Category | Master | ✅ Complete | `category-module.jsx` (Vendure collections) | — |
| Tax master | Master | ✅ Complete (real) | `settings-module.jsx` (`posTaxMasters`) | — |
| Barcode | Master | ✅ Complete | `barcode-module.jsx` + `core/barcode/*` | 2.4 (verify) |
| Price tiers / Units | Master | 🟨 Partial | server `PosItemPriceTier`/`PosUnit` | — |
| Supplier | Master | 🟨 Partial | via Ledger (no dedicated master) | — |
| Brand/Rate/Size/Salesman masters | Master | 🟥 Dead code (localStorage, unreachable) | `master-modules.jsx` | 1.4 (delete) |

## Accounting / Reports
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Party ledger (cust/supplier) | Accounting | ✅ Complete | `ledger-module.jsx` + `plugins/ledger` | — |
| Receipts (customer) | Accounting | ✅ Complete | `receipt-module.jsx` | — |
| Payments (supplier) | Accounting | ✅ Complete | `payment-module.jsx` | — |
| Day Book | Reports | ✅ Complete | report id `daybook` | — |
| Sales/Purchase/Stock/Expense reports | Reports | ✅ Complete (wired) | `report-registry.js` | — |
| Expense entry (feeds Expense Report) | Reports | 🟦 Backend-only | server expense CRUD (no UI) | 2.5 |
| GSTR-1 / GSTR-3B | Reports | 🟦 Backend-only | server `gstr1Report`/`gstr3bReport` (no UI) | 1.3 (summary), 5.2 (filing) |
| Chart of accounts / journal (double-entry) | Accounting | ⬜ Missing | — | M5 backlog |

## Platform / Enterprise
| Module | Domain | Status | Location | Target Sprint |
|---|---|---|---|---|
| Company (multi-company + GST identity) | Core | ✅ Complete | `settings-module.jsx`, `PosCompany` | — |
| POS users | Core | ✅ Complete | `plugins/pos-auth`, `UserManagementModule` | — |
| Roles & permissions | Core | 🟨 Partial (leans on Vendure roles) | `settings-module.jsx` | — |
| Token entry | Core | ✅ Complete | `token-entry-module.jsx` | — |
| Warehouse / Branch masters | Enterprise | ⬜ Missing (labels only; `warehouseId` seeded) | — | 3.1 |
| Approval workflows | Enterprise | ⬜ Missing | — | 3.3 |
| Notifications | Enterprise | ⬜ Missing | — | 3.4 |
| Audit logs | Core | ⬜ Missing | — | M5 backlog |

## Verticals (all Missing — M4)
| Vertical | Status | Target Sprint |
|---|---|---|
| Restaurant / KOT | ⬜ Missing | 4.1 |
| Pharmacy (clinical) | ⬜ Missing | 4.2 |
| Service | ⬜ Missing | 4.3 |
| Manufacturing | ⬜ Missing | 4.4 |
| CRM / HR | ⬜ Missing | (not yet scheduled) |
