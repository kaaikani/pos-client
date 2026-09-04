# Legacy Trading ERP — what to take from it

> Read from the local MSSQL instance on 2026-08-27: `RamdevMas` / `Ramdev2627`
> (Traders), `HotelMas` / `Hotel2526` (Restaurant), `ShopMas` / `Shop2526`
> (Supermarket). A mature, shipping Indian trading ERP — **133 tables and 640
> stored procedures** in the Traders year-database alone.
>
> This is the single most useful reference available for this project: it is a
> working answer to problems we are still designing. Nothing here should be copied
> verbatim — the schema is Windows-desktop-era — but the *decisions* it encodes are
> worth taking almost wholesale.

---

## 1. The finding that matters most

**Three business types run on one core.** Comparing the table sets proves it:

| | Tables | Shared with Traders |
|---|---|---|
| Traders (`Ramdev2627`) | 133 | — |
| Restaurant (`Hotel2526`) | 82 | 67 |
| Supermarket (`Shop2526`) | 160 | 87 |

Every one of them has the same accounting engine, the same sale/purchase/return
documents, the same item and stock tables, the same config and security tables.
**The differences are a thin layer on top.**

### Restaurant adds — 16 tables
`TableMaster` · `TableHdr` · `TableDet` · `TableNoTbl` · `Waiter` ·
`SalOrdHdr` / `SalOrdDet` (KOT) · `RmvSalHdr` / `RmvSalDet` (voided items) ·
`Material` + `MaterialGrpHdr` / `MaterialGrpDet` (recipe / BOM) · `DeliveryType`

### Supermarket adds — 70+ tables
`RackMaster` / `RackAssignHdr` / `RackAsgnDet` (shelf location) ·
`CashPointHdr` / `CashPointDet` (till / counter) · `BillCount` ·
`PointsMas` / `PointsLevel` / `PointsRedemption` / `PointPosting` (loyalty) ·
`CardDet` / `CardVisit` (membership) · `BundleHdr` / `BundleDet` (combo) ·
`ConvHdr` / `ConvFrmDet` / `ConvToDet` / `ItemConvDet` (repacking) ·
`DamageHdr` / `DamageDet` · `Godown` (warehouse) · `IndentHdr` / `IndentDet`
(branch requisition) · **`StkTranHdr` / `StkTranDet` (stock transfer)** ·
`DeliveryChallanHdr` / `DeliveryChallanDet` · `SeasonCatDet` / `SeasonItemDet` ·
`Emp_*` (attendance and payroll) · `ProcDateLock`

### Traders adds
`QuotHdr` / `QuotDet` (quotation) · `PoHdr` / `PoDet` (purchase order) ·
`InwHdr` / `InwDet` (goods receipt) · `MatPur*` / `MatSal*` (job work) ·
**`OutStandingPendingHdr` / `OutStandingPendingDet` (bill-wise allocation)** ·
`RateType` / `RateTypeDet` / `CustomerItemRateDet` (price tiers) ·
`BarcodeDesignHdr` / `BarCodeDesignDet` / `BarCodeFields` ·
`ZSalBill` / `ZSalItem` (Z-report) · `EstimateHdr` / `EstimateDet` ·
`TallyHeadMap` (Tally export) · `GSTB2B`

> **This is empirical proof of the capability model in `TARGET_ARCHITECTURE.md` §3.**
> One industry-independent core plus a small vertical layer is not a theory — it is
> how a shipping product with three verticals is already built. Our
> `PosBusinessProfile` + `PosCapability` design maps onto it directly.

---

## 2. The accounting engine — take this design

This is the Phase-4 posting engine, already solved. Four levels, then the journal.

```
Acc_UnderGroup     4 fixed rows: Assets · Liabilities [B] · Expenses · Income [T]
   └─ Acc_Group    Fixed Assets · Current Assets · Capital Account · Liabilities ·
                   Current Liabilities · Loans (Liability)   → BsGrp = B
                   Trading                                    → BsGrp = T
                   Profit & Loss                              → BsGrp = P
      └─ Acc_SubGroup1
         └─ Acc_SubGroup2
            └─ Acc_Achd  (the account head)
               + Acc_AchdDet  opening balance, Dr/Cr, credit-limit days & amount,
                              group ids, hidden flag, rate type
```

`BsGrp` is the statement an account rolls into — **T** = Trading Account,
**P** = Profit & Loss, **B** = Balance Sheet. That single character drives all
three financial statements, which is why they never disagree.

### The journal

```
Acc_JournalHdr   JouId · DocNo · DocDt · Nar1..Nar5 · DocType · UserId · CompId
Acc_JournalDet   JouId · AccId · Amount · DrCr
```

Two tables. Five narration lines because a real voucher needs them. `DocType`
records which kind of document produced the entry.

### Posting rules

`Acc_PostingMapDet` maps `MapType` → `AccId`: which account a document type posts
to. The posting itself lives in dedicated procedures, one per document:

```
Acc_DayPostSp                    the online posting entry point
Acc_OffLineDayPostSpSal          sale        → journal
Acc_OffLineDayPostSpSalRet       sales return
Acc_OffLineDayPostSpPur          purchase
Acc_OffLineDayPostSpPurRet       purchase return
Acc_OffLineDayPostSpRec          receipt
Acc_OffLineDayPostSpPay          payment
```

**One posting routine per document type, mapped through a configurable account
table.** That is exactly the shape our `accounts` plugin should take — the map is
data, not code, so a shop can point "Sales" at its own account without a release.

### Financial reports, already named

| Procedure | Report |
|---|---|
| `Acc_Qry_TrBalRptLed` / `Acc_Qry_TrBalRptGrpLed` | Trial Balance (ledger-wise / group-wise) |
| `Acc_Qry_PrLossReportFn` / `Acc_Qry_ProfitLossLedFn` | Profit & Loss |
| `Acc_Qry_Balreport` / `Acc_Qry_BalRptLed` / `Acc_Qry_BalRptLedBalGrp` | Balance Sheet |
| `Acc_Qry_LedRpt` / `Acc_Qry_LedMonRpt` | Party statement, monthly ledger |
| `Acc_Qry_DayBook` | Day Book |
| `Acc_TrBalBreakingDetRpt` | Trial Balance drill-down |
| `Acc_Qry_OpBalance` / `Acc_OpBalUpdSP` | Opening balances |

### Predefined accounts seeded on a new company

`CASH` (Current Assets) · `Sales A/c` (Trading) · `Estimate Sales A/c` (Trading) ·
`DEBITNOTE` (Trading) · `Round Off`, `CASH DISCOUNT`, `PACKING CHARGE`, `CARTAGE`,
`Advance A/c`, `Opening Balance` (P&L) · `AGENT COMMISION`, `BANK COMMISION`,
`DD COMMISION`, `INTEREST`, `OTHERS` (Loans)

**Take this list as our seed chart of accounts.** It is what an Indian trading
business actually needs on day one — no more, no less.

---

## 3. Year-wise databases — a decision to copy, not the mechanism

The naming is `<Name>Mas` + `<Name>2526` / `<Name>2627`:

* **`…Mas`** holds what outlives a year — `Company`, `Location` (branches),
  `AccYear`, `UserType`, `SecHdr`/`SecDet`/`SecCmpDet` (permissions), `Forms`,
  `UserMenuConfig`, `PrintDetail`, `Unit`, `DateLock`, `audithdr`/`auditdet`.
* **`…2627`** holds one financial year of transactions and its own masters.
* `CreateMasSynonySP` / `DropSynonySP` wire the year database to the master with
  SQL synonyms, so year code reads master tables as if they were local.
* `NextYear_OpBalUpdSp` · `NextYear_StockUpdSp` · `NextYear_CustomerBalUpdSp` ·
  `NextYear_SupplierBalUpdSp` · `NxtYrMasterSp` · `NxtYrPendingSp` roll the year over.

**What to take:** the *separation* — shared masters versus year-scoped
transactions, plus an explicit year-end rollover that carries balances, stock and
pending bills forward. **What not to take:** a database per year. In our stack that
is a `fiscalYearId` column plus a period lock (`DateLock` there,
`PosFiscalYear` + period lock here). Same guarantees, no schema sprawl.

---

## 4. Configuration — this is the spine we designed, already shipping

| Table | What it configures |
|---|---|
| `Configuration`, `GenConfig` | company-wide behaviour |
| `Config_Sales`, `Config_SalTerms` | how the sales screen behaves, bill terms |
| **`Config_DefaultFocus`** | **keyboard focus order, per document type** |
| `UserKeyConfig` | shortcut keys, per user |
| `UserMenuConfig` (Mas) | menu, per user |
| `Config_PrnModel` / `Config_PrnModelDet`, `PrintSettings`, `PrintDocRef` | printer per document |
| `BarcodeDesignHdr` / `Det`, `BarCodeFields` | label designer |
| `PointSettings` | loyalty rules |
| `RateType` / `RateTypeDet` | price tiers |

### `Config_DefaultFocus` deserves its own note

```
Id | Name        | DocType
 1 | BillDate    | S      (sale)
 2 | BillMode    | S
 3 | RateType    | S
 4 | Book        | S
 5 | SalesMan    | S
 6 | ItemDetail  | S
 7 | PurDate     | PU     (purchase)
 8 | Type        | PU
 9 | InvNo       | PU
10 | InvDate     | PU
11 | Supplier    | PU
12 | ItemDetail  | PU
```

An ordered list of field names per document type — **the Enter-key tab order is
data, not code.** Our `useFieldFlow` takes exactly this shape; it currently reads a
hard-coded array. Feeding it from a `PosDocumentPolicy.focusOrder` makes the order
configurable per shop, which is what this product does.

---

## 5. Security model

`UserType` · `SecHdr` · `SecDet` · `secdetnat` · `SecCmpDet` · `Forms` · `frmnat`

Permissions are granted **per form, per company** — not one flat admin flag. A
`Forms` registry lists every screen; `SecDet` grants a user type access to a form;
`SecCmpDet` scopes it to a company. Our `SCREEN_PERMISSION` map is the same idea;
what we are missing is the per-company scope and a UI to edit it.

---

## 6. Documents we do not have, and the tables that show how

| Document | Legacy tables | Our status |
|---|---|---|
| Quotation | `QuotHdr` / `QuotDet` | missing |
| Purchase Order | `PoHdr` / `PoDet` | backend exists, no screen |
| Goods Receipt / Inward | `InwHdr` / `InwDet` | missing entirely |
| Delivery Challan | `DeliveryChallanHdr` / `Det`, `DCHdr` / `DcDet` | missing |
| Stock Transfer | `StkTranHdr` / `StkTranDet` | missing |
| Branch Indent | `IndentHdr` / `IndentDet` | missing |
| **Bill-wise outstanding** | `OutStandingPendingHdr` / `Det` | **missing — this is what makes receipt allocation work** |
| Z-report | `ZSalBill` / `ZSalItem` | missing |
| Damage / write-off | `DamageHdr` / `DamageDet` | missing |
| Item conversion / repack | `ConvHdr` / `ConvFrmDet` / `ConvToDet` | missing |
| Estimate | `EstimateHdr` / `EstimateDet` | missing |

`OutStandingPendingHdr/Det` is worth calling out: it is the table that lets a
receipt be applied against specific bills and lets ageing be computed per bill
rather than per party. Every "why does the ageing look wrong" problem comes from
not having it.

---

## 7. What to do with this

1. **Seed chart of accounts** — take the predefined list in §2 verbatim.
2. **Accounting engine** — copy the four-level group hierarchy, the two-table
   journal, and one posting routine per document type driven by a mapping table.
3. **Capability model** — the §1 diff is the vertical definition. Restaurant =
   tables, waiter, KOT, recipe. Supermarket = rack, till, loyalty, transfer,
   indent, godown. Traders = quotation, PO, inward, price tiers, bill-wise
   outstanding.
4. **`Config_DefaultFocus`** — make our focus order configurable the same way.
5. **Fiscal year + period lock** — a column and a lock, not a database per year.
6. **Bill-wise outstanding** — build it before Receipt and Payment screens, or
   allocation and ageing will both be wrong.
7. **Per-form, per-company permissions** — extend `SCREEN_PERMISSION` with company
   scope, and build the roles screen.

### Do not copy
* A database per financial year.
* 640 stored procedures — business logic belongs in the service layer where it can
  be tested and reviewed.
* `Num122` / `Num142` custom numeric types and the abbreviated column names
  (`AcCode`, `Nar1..5`, `BsGrp`) — readable names cost nothing.
* Duplicate rows in `Acc_Achd` per company. Scope with a channel/company column
  instead of repeating the account.
