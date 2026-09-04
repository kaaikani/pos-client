# Bug Tracker

> Known-issue register seeded from the Phase-1/2 analysis. Update **Status** as bugs are fixed; link the fixing commit in **Notes**. New bugs get the next `BUG-NNN` id.

**Severity:** High · Medium · Low  |  **Status:** Open · In Progress · Fixed · Won't Fix

| ID | Title | Severity | Module | Type | Status | Fix Sprint | Notes |
|---|---|---|---|---|---|---|---|
| BUG-001 | Stock Adjustment saves only to `localStorage`, never the server (`createPosStockAdjustment` ignored) — adjustments never affect real stock | High | `stock-adjustment-module.jsx` | Data-loss | **Fixed** | Stage A | Module rewritten server-backed; one `createPosStockAdjustment` per line, log read from `posStockAdjustments` |
| BUG-002 | Purchase Return saves only to `localStorage`, never the server (`createPosPurchaseReturn` ignored) | High | `purchase-return-module.jsx` | Data-loss | **Fixed** | Stage A | Rewritten as a source-bill flow — the server mandates `originalPurchaseId` and rejects free-form returns |
| BUG-003 | Stock Adjustment showed `minStkQty || minStock` as "Current stock" — with zero stock it fell through and displayed the **reorder level** | Medium | `stock-adjustment-module.jsx` | Correctness | **Fixed** | Stage A | Now reads `currentStock` (added to `ITEM_FIELDS`), no falsy fallthrough |
| BUG-004 | Goods-receipt / Inward has no server backend at all (mock localStorage only) | Medium | `inward-module.jsx` | Missing backend | Open | M5 backlog | Needs new server entity — not in M1/M2 |
| BUG-005 | `stock-updation` module mislabeled — only edits `minStkQty` (reorder level), not on-hand stock | Low | `stock-updation-module.jsx` | Mislabel | Open | 1.4 | Relabel to "Min Stock / Reorder Qty" |
| BUG-006 | `master-modules.jsx` is unreachable dead code — 7 localStorage masters routed in the switch but absent from the menu | Low | `master-modules.jsx` | Dead code | Open | 1.4 | Delete after grep-confirming no other importer |
| BUG-007 | Duplicate localStorage TaxMaster shadows the real server `posTaxMasters` (two competing tax masters) | Medium | `master-modules.jsx` | Duplicate | Open | 1.4 | Removed with BUG-006 |
| BUG-008 | Substantial server backends have no UI (Sales Return, Purchase Order, Expenses, Stock Ledger, GSTR-1/3B) | Medium | multiple | Missing UI | Open | M1 (1.3) / M2 (2.1,2.2,2.3,2.5) | Surfaced across M1–M2 |
| BUG-009 | Hold/recall bills stored browser-local (`pos_parked_bills`) — lost across devices/sessions, not auditable | Medium | `pos-module.jsx` | Durability | Open | M5 backlog | Needs server persistence design |
| BUG-010 | Only 1 migration for ~25 custom tables + `synchronize:true` in dev → unsafe clean prod deploy | High | Server config (`vendure-config.ts`, `migrations/`) | Deploy risk | Open | 5.1 | Flagged now, fixed pre-launch |
| BUG-011 | Credit-sale customer ledger entry failed into `console.warn` — a credit bill could save with **no receivable recorded** while the operator saw success | High | `pos-module.jsx` | Data-loss | **Fixed** | Stage A | Now raises an explicit alert plus a persistent on-screen banner naming bill, party and amount. Root fix is Stage E `commitPosSale` (single transaction) |
| BUG-012 | Client ran its own `createProduct` + `createProductVariants` on item save, duplicating and racing the server's `VendureForwardSyncService` (which already upserts by SKU in the same transaction) | High | `pharma.query.js`, `item-master-module.jsx` | Duplicate/race | **Fixed** | Stage A | Client-side `SyncItemToVendureCommand` deleted; server-side sync is now the only path |

| BUG-013 | Vendure roles `pos-admin` / `pos-user` exist in the current dev DB but are **never seeded by code**. On a fresh install `CreateAdministratorCommand` therefore falls back to `__super_admin_role__` for admins — making every POS admin a full SuperAdmin — and throws outright for cashiers | High | `auth.query.js`, server bootstrap | Reproducibility / privilege | Open | Stage A1 | Not broken in THIS database; breaks on every new deployment. Seed both roles in code and remove the SuperAdmin fallback |
| BUG-014 | Admin bearer token stored in `localStorage` (`pos_session`) — readable by any XSS. Vendure already runs `tokenMethod: [bearer, cookie]` | High | `gql.js`, `login/page.jsx` | Security | Open | Stage A1 | Switch the browser client to the httpOnly cookie method |
| BUG-015 | Dead parallel auth system: `pos-auth` plugin issues its own bcrypt/JWT identity that Vendure does not understand. `posLogin` is `Permission.Public` and is called by nothing in the client | Medium | `plugins/pos-auth` | Dead code / attack surface | Open | Stage A1 | Delete the plugin — the client already uses Vendure native `login` |
| BUG-016 | No rate limiting or account lockout on login — unlimited password attempts | Medium | Server auth | Security | Open | Stage A1 | Add attempt throttling + lockout |
| BUG-017 | Fake email domain: usernames are turned into `<name>@avsecom.local` and login silently retries with that suffix. Password reset by email can never work | Medium | `auth.query.js` | Correctness | Open | Stage A1 | Use real email addresses as the identifier |
| BUG-018 | `superadmin` is used as the day-to-day operator login — no per-cashier identity, so no audit trail of who billed what | Medium | Operations | Auditability | Open | Stage A1 | Named accounts per operator; superadmin reserved for setup |

| BUG-019 | `authOptions.superadminCredentials` only applies to a fresh DB, so editing `SUPERADMIN_PASSWORD` in `.env` after install silently does nothing and locks the operator out with no error or recovery path | Medium | `vendure-config.ts`, ops | Ops / lockout | Open | Stage A1 | `Server/src/reset-admin-password.js` added as the recovery path; document it in the deployment checklist |

## Additional observations (not yet ticketed as bugs)
- Mixed UI libraries in the dashboard (shadcn/Radix **and** Ant Design) — inconsistency; consolidation deferred to M5.4 backlog.
- Two overlaid apps in the client: unused Vendure storefront routes coexist with the POS/ERP dashboard.
- Line items stored as JSON text (`rowsJson`/`itemsJson`) rather than relational child tables — reporting parses JSON. Architectural, not a bug.
