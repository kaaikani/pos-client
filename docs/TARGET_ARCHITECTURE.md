# Target Architecture — Industry-Independent POS + Accounts Platform

> Companion to `GAP_ANALYSIS_AND_PLAN.md` (where the project is today) and
> `PROJECT_ROADMAP.md` (the feature backlog). **This document is where the project is going:**
> one product that serves supermarket, trader/B2B, B2C retail, and pharmacy from a single core,
> with web + Android clients, offline sync, and a real printing fabric.
> Written 2026-08-27, against commit `43745cb`.

---

## 0. The finding that changes the cost of this

**The project is pharma-based in *naming*, not in *domain model*.** Measured:

| Fact | Number |
|---|---|
| Custom server entities | 22 |
| Already neutrally named (`Pos*`) | **16** |
| Carrying the `Pharma` prefix | **6** — `PharmaItem`, `PharmaSale`, `PharmaPurchase`, `PharmaPayment`, `PharmaReceipt`, `PharmaToken` |
| Of those, genuinely clinical in their *fields* | **1** — `PharmaToken` (`patientName`, `injAmt`) |

`PharmaItem` is already a generic retail item master: `brand`, `hsnCode`, `barcode`, `upcCode`,
`mrpRate`, `isWeightBased`, price tiers, base/secondary unit with `conversionRate`, min/max stock.
Nothing in it is drug-specific. `batchNo` / `mfgDate` / `expiryDate` are needed by any supermarket
selling FMCG. `PharmaSale` / `Purchase` / `Payment` / `Receipt` are ordinary trade documents.

**Consequence:** making this industry-independent is a **rename plus a configuration spine**,
not a rewrite. That is the single most important thing to understand before planning.

### What *is* genuinely missing for multi-industry

| Gap | Evidence | Severity |
|---|---|---|
| **No tenant scoping at all** — zero `channelId` on any custom entity, `Channel` never referenced in any plugin | `grep "Channel" Server/src/plugins` → 0 hits | **Blocking** for multi-branch / multi-company / SaaS |
| **No configuration spine** — `PosSetting` is a singleton with 2 booleans; everything else is `localStorage` | `pos-setting.entity.ts`; `pharma_config`, `pharma_config_properties` | **Blocking** for multi-industry |
| **God service** — one file holds nearly all business logic | `pharma.service.ts` = **5,015 lines** | High |
| **Duplicate item-sync paths** — server already has `vendure-forward-sync` + `vendure-reverse-sync` with loop prevention, yet the browser *also* runs its own `SyncItemToVendureCommand` | both exist | **High — they fight each other** |
| Client has zero TypeScript | 160 `.jsx`, 0 `.tsx` | Blocking for code sharing with Android |

---

## 1. Stack verdict — do not change the language

**Keep TypeScript. Keep NestJS/TypeORM/GraphQL. Keep MySQL. Keep React.**

The problems found in the audit are *architectural*, not language problems. Rewriting in another
language would discard a working GST engine, a working stock ledger, a working barcode/label
system, and a working invoice renderer — and reproduce every one of the same faults.

| Layer | Decision | Reason |
|---|---|---|
| Server language | **TypeScript** — keep | Already there; shares types with both clients |
| Server framework | **Vendure (NestJS) — keep, but use it properly** | See §1.1 |
| Database | **MySQL — keep**, add proper migrations | BUG-010 must be fixed regardless |
| API | **GraphQL — keep** | Ideal for one-call-per-screen (`posBootstrap`) and for a mobile client on a slow link |
| Web client | **Next.js — keep, migrate to TypeScript** | TS is now *mandatory*, not optional — see §1.2 |
| Android client | **Expo / React Native** | See §5 |
| Repo shape | **Monorepo** | See §2 |

### 1.1 On Vendure — keep it, but stop fighting it
Vendure is an e-commerce platform, and this is an ERP. That mismatch is real. But it is paying for
auth, roles, migrations, the plugin system, the job queue, the email plugin, and the B2C storefront
that the B2C requirement needs anyway. Two changes make it fit:

1. **Use `Channel` for tenancy.** Vendure's channel system is exactly the multi-branch /
   multi-company model needed, and it is currently used for nothing. Every custom entity gets a
   `channelId`, every query gets scoped by `ctx.channelId`. Doing this now is a migration;
   doing it after go-live is a rescue operation.
2. **One direction of truth for items.** `PosItem` is the master; the Vendure `Product`/`Variant`
   is a *projection* for the B2C storefront, maintained only by the existing server-side
   forward-sync service. **Delete the client-side `SyncItemToVendureCommand`** — it duplicates
   and races the server's own sync.

### 1.2 TypeScript is now mandatory
Previously "nice to have". Once an Android app has to share tax math, GST logic, document models,
and print encoding with the web, a plain-`.jsx` client cannot share anything. The shared domain
package must be typed, and both clients must consume it. `tsconfig.json` and `codegen.ts` already
exist in the repo, unused.

---

## 2. Repository shape

```
pos/
├─ packages/                        ← shared, platform-agnostic, pure TypeScript
│  ├─ domain/       Money, tax & GST math, rounding, document models, validation
│  ├─ api/          graphql-codegen output + typed operations (single source of API truth)
│  ├─ config/       feature-flag + screen-policy schema, resolver, defaults per profile
│  ├─ print/        document → ESC/POS bytes · ZPL/TSPL · PDF   (no IO, no DOM)
│  ├─ sync/         outbox queue, pull cursor, conflict rules
│  └─ tokens/       design tokens (colour, type, spacing) shared web + native
├─ apps/
│  ├─ server/       Vendure + core plugin + vertical plugins
│  ├─ web/          Next.js — POS counter + back office
│  ├─ mobile/       Expo React Native — counter + van sales + stock count
│  └─ agent/        small Node service: wired/network printer bridge + cloud print worker
```

The rule that makes this work: **`packages/*` never imports from `apps/*`, and never touches IO.**
Tax math, rounding, and print encoding are pure functions — the same bill total and the same
receipt bytes on web, on Android, and on the server.

### Server plugin split
```
apps/server/src/plugins/
├─ core/            item, stock, sale, purchase, party, tax, document series, config   ← industry-independent
├─ accounts/        chart of accounts, journal, reports                                 ← the Phase-4 engine
├─ print/           printer registry, routes, templates, cloud print queue
└─ verticals/
   ├─ pharmacy/     prescription, doctor, drug schedule, per-lot batch, token/queue
   ├─ supermarket/  weighing scale, shelf label, hourly footfall, offers
   ├─ trader/       B2B price lists, credit limits, delivery challan, e-Way Bill
   ├─ restaurant/   KOT, table, captain order
   └─ service/      job card, technician, warranty, AMC
```
`PharmaToken` — the one truly clinical entity — moves into `verticals/pharmacy` as `ClinicToken`.
A vertical may read core services and subscribe to core events. **A vertical may never be imported
by core.** Enforce with an ESLint boundary rule, not with discipline.

---

## 3. The configuration spine — the heart of the requirement

The goal is stated precisely: *every business type supported, decided in configuration, and every
sales screen has a settings control that decides its behaviour.* That requires **four layers**,
all server-side, all channel-scoped, none in `localStorage`.

```
  1. BUSINESS PROFILE     "Supermarket" · "Pharmacy" · "Trader B2B" · "Restaurant" · "Service"
         │                 a named bundle of defaults — nothing more
         ▼
  2. CAPABILITIES         batchTracking · expiryTracking · weighingScale · prescription
         │                serialTracking · tokenQueue · creditLimit · kot · eWayBill · loyalty
         │                (boolean or small enum, per channel — gates modules, menus, columns)
         ▼
  3. DOCUMENT POLICY      per document type (SALE_B2C, SALE_B2B, ESTIMATE, CHALLAN, KOT …)
         │                columns · mandatory fields · tax mode · rounding · discount ceiling
         │                numbering series · allowed tenders · print route
         ▼
  4. COUNTER OVERRIDE     per terminal: printer routes, default document type, drawer,
                          allowed discount %, offline mode
```

### Entities
```ts
PosBusinessProfile { id, channelId, code, name, capabilities: json, isTemplate }
PosCapability      { id, channelId, key, value, updatedBy, updatedAt }
PosDocumentPolicy  { id, channelId, docType, policy: json, seriesId }
PosCounter         { id, channelId, branchId, code, name, overrides: json }
PosDocumentSeries  { id, channelId, docType, prefix, fyCode, nextNumber, width }
```

### The rule that keeps this honest
> **No `if (industry === 'pharmacy')` anywhere in the codebase.**
> Screens render from a **field registry** — each field declares its key, label, type, the
> capability that gates it, and its validation. The pharmacy profile turns on `batchTracking`
> and `expiryTracking`; the batch and expiry columns appear. The supermarket profile turns on
> `weighingScale`; the barcode parser starts decoding embedded-weight EAN-13. No branch, no fork.

This is also what the "settings on every sales page" ask becomes: each sales screen reads its
`PosDocumentPolicy`, and the gear icon on that screen edits *that policy*, scoped to the counter.
The change is saved server-side, so it applies on the web dashboard and the Android app together.

### Migration path from today
`pharma_config`, `pharma_config_properties`, `pharma_print_settings` in `localStorage` are read
once at first login after the upgrade, written into `PosCapability` / `PosDocumentPolicy` for the
active channel, then the keys are deleted. `isSectionEnabled()` in `page.jsx` becomes a lookup
against server capabilities instead of a `localStorage` array.

---

## 4. Printing fabric — web, Android, wired, wireless, remote

One model has to cover: A4 laser in the office, 3&Prime; thermal on the counter, a wireless
Bluetooth thermal on a delivery bag, a WiFi kitchen printer, a ZPL label printer, and printing a
bill from a phone that is nowhere near the shop. The way tier-one products do this is a
**print job queue plus per-connection drivers** — never direct device calls from screen code.

```
  render on server               enqueue                    claim & print
  ┌──────────────────┐      ┌──────────────────┐      ┌─────────────────────────┐
  │ document model   │ ──▶  │  PosPrintJob     │ ◀──  │ Print target            │
  │ (JSON, from DB)  │      │  status/attempts │      │  · web + QZ Tray        │
  │        │         │      │  payload ref     │      │  · desktop print agent  │
  │        ▼         │      └──────────────────┘      │  · Android app          │
  │ packages/print   │            ▲                   │  · direct TCP :9100     │
  │  ESC/POS │ ZPL   │            │ subscribe          └─────────────────────────┘
  │  TSPL    │ PDF   │            │ (GraphQL subscription / SSE)
  └──────────────────┘────────────┘
```

**Why a queue and not a direct call:** it is the only design where "print this bill" works
identically from a counter PC, from a phone in the next street, and from a scheduled report — and
where a printer that was switched off gets its job when it comes back.

### Printer registry
```ts
PosPrinter {
  id, channelId, branchId, name,
  connection: 'NETWORK' | 'USB' | 'BLUETOOTH' | 'SYSTEM' | 'AGENT',
  address,        // "192.168.1.50:9100" | usb vid:pid | BT MAC | OS printer name
  language: 'ESCPOS' | 'ZPL' | 'TSPL' | 'PDF',
  widthMm, dpi, codepage,          // 58 / 76 / 104 / 152 mm; cp437, cp1252, or UTF-8
  drawerKick, autoCut, isDefault
}

PosPrintRoute {
  id, channelId, counterId, docType,   // INVOICE · KOT · LABEL · PO · RECEIPT · ZREPORT · A4_COPY
  printerId, copies, paperSize, templateId, copyMarking
}
```
**Multiple printers per counter falls straight out of this.** One counter can route the bill to
its 3&Prime; thermal, the KOT to the kitchen's WiFi printer, shelf labels to a TSPL label printer,
and the A4 GST copy to the office laser — all at once, all configured, no code change.

### Connection matrix
| Client | Wired USB | Wired LAN | Wireless WiFi | Bluetooth | Remote / "online print" |
|---|---|---|---|---|---|
| **Web** | QZ Tray *(already integrated)* or agent | TCP `:9100` via agent | TCP `:9100` via agent | via agent | print job queue |
| **Android** | USB-OTG host | TCP `:9100` — plain socket, easiest path | TCP `:9100` | ESC/POS over Bluetooth SPP | print job queue |
| **Server** | — | TCP `:9100` | TCP `:9100` | — | native (it *is* the queue) |

Two notes that save weeks later: **label printers speak ZPL or TSPL, not ESC/POS** — treat the
language as a printer property from day one, which the registry above does. And **Indic text on
thermal printers**: most cheap ESC/POS units cannot render Tamil from a codepage. Bills carrying
`tamilName` must render that portion as a **raster image** (ESC `*` / GS `v 0`), which
`packages/print` handles once for every platform.

### What exists today vs. what this needs
`core/invoice/invoice-pdf.js` (A4/A5/A6 + 3&Prime;/4&Prime;/6&Prime;) and `core/barcode/*` (WYSIWYG label
designer, QR, PDF) are good work and move into `packages/print` largely intact.
`core/barcode/qz-print.js` becomes one *driver* behind the transport interface rather than the
only way anything prints.

---

## 5. Android and web/server sync

### Client choice: Expo (React Native)
| Option | Verdict |
|---|---|
| **Expo / React Native** | **Recommended.** Shares `packages/domain`, `packages/api`, `packages/config`, `packages/print` verbatim with the web. One team, one language, one set of business rules. Bluetooth/USB/TCP printing all reachable via native modules. |
| Flutter | Better raw performance, but Dart means the tax engine, GST logic, and print encoding get written and maintained **twice** — the exact class of bug that is expensive forever. |
| PWA / TWA only | Cheapest, but Web Bluetooth and Web USB are Chrome-Android-only, cannot print silently, and background sync is unreliable. Fine as a *view-only* companion; not for a billing counter. |

### Sync design — make conflicts impossible rather than resolving them
1. **Client-generated UUID, server-assigned number.** Every document is created locally with a
   UUID. The **server** assigns the legal document number from `PosDocumentSeries` at commit.
   Never the client. (This also fixes the bill-number race that exists on the web today.)
2. **The commit mutation is idempotent.** `commitPosSale(input, clientUuid)` — replaying the same
   UUID returns the original result instead of creating a second bill. This is what makes a flaky
   mobile connection safe.
3. **Transactional documents are immutable.** A committed sale is never edited; corrections are
   credit notes. Immutable documents cannot conflict, which removes the hardest part of sync.
4. **Masters use last-write-wins on server timestamp**, with a visible "changed on another device"
   notice. Items and prices change rarely; this is sufficient and understandable.
5. **Outbox + cursor.** Writes queue locally (SQLite on Android, IndexedDB on web) and drain in
   order. Reads pull by `updatedAt` watermark per entity. Both live in `packages/sync`, so the web
   gets offline billing for free once Android has it.
6. **Clock skew is real.** Order by server-assigned sequence, never by device time. A counter PC
   with a wrong date must not be able to reorder the day book.

> **Decide offline-first now, not later.** Retrofitting it after Phase 2 means rewriting every
> `commit*` mutation. Designing the mutations idempotent from the start costs almost nothing.

---

## 6. What "best UI" means, measurably

"Professional" is not a look — for a POS it is **speed at the counter**. Make it testable:

| Target | Threshold |
|---|---|
| Complete a 5-line cash bill, keyboard only | **&lt; 8 seconds** |
| Mouse actions required in the billing flow | **0** |
| Keystroke → on-screen response | **&lt; 100 ms** |
| Item search over 50,000 SKUs | **&lt; 150 ms** to first result |
| Bill saved → receipt physically printing | **&lt; 1.5 s** thermal |
| Screen load API calls | **1** |
| Native `alert` / `confirm` in the codebase | **0** (from 162) |
| Works at | **1366×768**, the standard POS monitor |
| Android touch targets | **≥ 44 px** |
| Contrast | **WCAG AA**, and legible under shop fluorescent light at arm's length |
| Recovery after a crash mid-bill | Cart restored, **nothing lost** |

Design system rules: one token set in `packages/tokens` driving both web and native; density
tuned for data entry, not for marketing pages; state encoded in *form* as well as colour (a
severity stripe, a chip) so it reads at a glance; every destructive action reversible or confirmed
in-app — never by a browser dialog.

---

## 7. Execution plan

This **supersedes the phase order in `GAP_ANALYSIS_AND_PLAN.md` §7**, because industry-independence
and Android change what must come first. The audit's *findings* all stand; the *sequence* changes.

### Stage A — Stop the bleeding (3 days) · start here, today
Two modules write to `localStorage` and silently discard data while a working backend sits unused.
Independent of everything below; do it first so nothing more is lost.
- Stock Adjustment (BUG-001, BUG-003) · Purchase Return (BUG-002)
- Remove the silent `catch` around the credit-sale ledger write
- **Delete the client-side `SyncItemToVendureCommand`** — the server already does this correctly and
  the two paths are racing

### Stage B — Neutralise the domain (2 weeks) · the rename, done once
Cheapest now; more expensive every week that more code references `pharma*`.
- `PharmaItem → PosItem`, `PharmaSale → PosSale`, `PharmaPurchase/Payment/Receipt → Pos*`
- `PharmaToken → ClinicToken`, relocated to `verticals/pharmacy`
- Plugin `pharma → core`; split `pharma.service.ts` (5,015 lines) into item / stock / sale /
  purchase / party / tax services
- GraphQL: new neutral operation names, **old names kept as deprecated aliases** for one release
  so the client can migrate screen by screen
- Table renames by migration, with `down()` — take a DB dump first

**Exit:** `grep -ri pharma Server/src/plugins/core` returns nothing.

### Stage C — Tenancy + configuration spine (3 weeks) · the actual multi-industry work
- `channelId` on every custom entity; every query scoped by `ctx.channelId`
- `PosBusinessProfile`, `PosCapability`, `PosDocumentPolicy`, `PosCounter`, `PosDocumentSeries`
- Field registry; `isSectionEnabled()` reads server capabilities, not `localStorage`
- One-time importer for existing `localStorage` config
- Seed profiles: **Supermarket · Pharmacy · Trader B2B · General Retail**

**Exit:** switching the profile from Supermarket to Pharmacy changes the visible columns, mandatory
fields, and menu — with zero code change and zero industry conditionals in the codebase.

### Stage D — TypeScript + monorepo (2 weeks, overlaps C)
- Lift the repo into the `packages/` + `apps/` layout
- `graphql-codegen` wired for real (`codegen.ts` already exists, unused)
- Migrate the client to `.tsx` — API layer and `packages/domain` first, screens after
- ESLint boundary rule: core must not import verticals

### Stage E — Process consolidation (2 weeks) · = audit Phase 2, now sync-aware
- `posBootstrap` — one call per screen
- `commitPosSale` / `commitItemMaster` — transactional, **idempotent on a client UUID**,
  server-assigned document numbers
- Server-side paging and search on every list
- **Exit:** billing screen makes 1 call to load, 1 to save (DevTools verified)

### Stage F — UI foundation (2 weeks) · = audit Phase 0, now config-driven
- `useFieldFlow`, `SHORTCUTS` map, footer hint bar
- `packages/tokens` + shared primitives, rendering **from the field registry**
- All 162 `alert`/`confirm` replaced
- **Exit:** one module rebuilt end-to-end as the reference every other module copies

### Stage G — Print fabric (2 weeks)
`packages/print` (ESC/POS · ZPL/TSPL · PDF, Tamil as raster), `PosPrinter` + `PosPrintRoute` +
`PosPrintJob`, the print agent, QZ as one driver among several, invoice direct printing.

### Stage H — Core POS completion (3 weeks) · = audit Phase 3
PO + convert, Sales Return, Stock Movement, Expenses UI, GRN backend, shift open-close + Z-report,
server-side hold/recall, price tiers in billing, multi-UOM conversion.

### Stage I — Accounting engine (8–10 weeks) · = audit Phase 4
Chart of Accounts, double-entry journal, posting rules, bank reconciliation, fiscal year,
Trial Balance → P&L → Balance Sheet → Cash Flow, stock valuation.

### Stage J — Android (6–8 weeks, can start after E)
Expo app on the shared packages; offline outbox; Bluetooth/TCP/USB printing; counter billing,
van sales, stock count. **Do not start before Stage E** — the app must be built against the
`commit*` mutations, not the 7-call flow.

### Stages K+ — Verticals · Enterprise · Launch
Supermarket / Trader / Pharmacy / Restaurant / Service modules; warehouse, branch, transfers,
approvals, audit log; migrations, e-Invoice / e-Way Bill, GST filing, security, deploy.

### Realistic timeline
Stages A–I are roughly **9 to 12 months** with 2–3 developers, Android running in parallel from
Stage J. Anyone quoting materially less is not counting Stage I.

---

## 8. Where to start — the answer

**Start at Stage A, this week — but do not start Stage B until §9 is answered.**

The order is not negotiable, and here is why each step must precede the next:

1. **A before everything** — data is being lost right now, and the fix is three days.
2. **B before C** — there is no point attaching a configuration spine and `channelId` to entities
   that are about to be renamed. Renaming after tenancy means touching every scoped query twice.
3. **C before F** — the UI primitives render *from* the field registry. Building them before the
   registry exists means building them twice, which is exactly the mistake that produced the
   current 20-modules-20-layouts state.
4. **E before J** — an Android app built against a 7-call bill flow over a mobile connection will
   not work, and would have to be rewritten against `commit*` anyway.
5. **I last among the functional stages** — the posting engine consumes sale, purchase, and return
   documents; those must be stable and transactional first.

The one thing to resist: starting with the Android app or with a UI redesign, because both are the
most visible. Both would be built on foundations that are about to move, and both would be thrown
away.

---

## 9. Decisions needed before Stage B starts

| # | Decision | Why it blocks |
|---|---|---|
| 1 | **Is this one deployment per shop, or one SaaS serving many?** | Determines whether `channelId` scoping in Stage C is optional or existential. Multi-tenant is far cheaper to build in now than to retrofit. |
| 2 | **Which verticals ship in v1?** | Supermarket + Trader + Pharmacy is a realistic v1. Restaurant KOT and Service job cards are large, separate bodies of work. |
| 3 | **Offline-first: in or out?** | If in, `commit*` must be idempotent from Stage E — near-free then, a rewrite later. |
| 4 | **Accounting depth** — full double-entry (~10 weeks) or lite, deriving Trial Balance and P&L from documents (~3 weeks, no true Balance Sheet)? | Sets the size of Stage I, the largest stage. |
| 5 | **Android timing** — parallel from Stage J, or after web v1 ships? | Parallel needs a second developer; sequential adds ~2 months to the end date. |
| 6 | **Is the Vendure B2C storefront actually being sold?** | If no, the item→Product projection can be dropped entirely and Stage B gets simpler. If yes, it is the reason to keep Vendure. |
