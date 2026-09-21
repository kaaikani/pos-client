# UI plan — screen by screen

One decision per screen, made here so it is not made twice.

**Look:** Direction B (light, elevated). **Rule for the whole app:** every screen
answers one question — *what did the operator come here to do?* — and the layout
serves that one answer. Everything else moves out of the way.

---

## Rules that apply to every screen

These are decided once. No screen repeats them.

| Rule | What it means |
|---|---|
| **Landing focus** | The cursor lands in the box where the work starts. Already done on 20 screens. |
| **Enter walks** | Enter moves to the next field. Never submits by accident. |
| **One primary button** | One accent button per screen. Everything else is plain. |
| **Numbers are big** | The number the operator reads is 2–3× the label. Money is tabular. |
| **Colour carries meaning** | Green in stock · amber near expiry · red danger · blue tax. Never decoration. |
| **Detail line, not columns** | Secondary facts sit in a small grey line under the name, not in extra columns. |
| **Gear per screen** | Anything adjustable lives behind the screen's own gear, not in a settings hunt. |
| **Empty and error states** | Every list says what to do when it is empty. Every failure says what to do next. |

---

## 1 · Selling

### POS / Sale — `pos`
The busiest screen in the product. The operator is standing, a customer is waiting.
**Shape:** one box that takes barcode *or* name · four columns (Item, Qty, Rate, Amount)
with batch/expiry/MRP/GST on a small line under the name · total and change due big on
the right · F-keys along the bottom.
**Which layout** is picked in Settings › Sale screen — Counter / Simple / Thottu / Table.
Now: 17 cramped columns, no landing focus (it crashed twice; both fixed).
→ Rebuilt. **2 days.**

### Token entry — `token`
A number called out at a counter. Nothing else matters.
**Shape:** name + mobile, one big **Next token** button, today's list beside it.
Now: already on the design system, flow works. → Re-skin only. **0.5 day.**

### Tables & orders — `restaurant`
The waiter's screen. Table first, then dishes, then the kitchen.
**Shape:** floor plan as colour (free / seated / billed) → tap a table → **dish tiles by
category**, not a search box. Notes as chips ("less spicy"), not a text field.
Now: dishes are added from a search dropdown — wrong for a tablet.
→ Tile panel + notes chips. **3 days.**

### Sales return — *no screen*
Server is finished. Open the original bill, tick what came back, done.
**Shape:** find bill → line list with return-qty boxes → reason → save.
→ Build. **1.5 days.**

### Quotation / Estimate — *nothing*
**Shape:** same as a sale, minus payment, plus a **Convert to bill** button.
→ Backend + screen. **2 days.**

---

## 2 · Buying

### Purchase — `purchase`
A supplier bill is copied in from paper. Speed matters less than accuracy.
**Shape:** header (supplier, invoice no, dates) → line grid with its own cell-to-cell
keys → totals. Keep the grid: here the operator *is* reading columns off a document.
Now: works, grid flow already correct. → Re-skin + header flow. **1 day.**

### Purchase return — `purchase-return`
**Shape:** find the purchase → tick lines → reason → save. Same skeleton as sales return.
Now: old styling, server-backed. → Rebuild on the design system. **1 day.**

### Purchase order — *no screen*
Server is finished. → Screen, and a **Receive** action that opens a purchase. **1.5 days.**

### Inward — `inward`
Goods arrived; the bill has not. Vehicle, driver, condition.
Now: localStorage only, `alert()`, raw styling — the data is lost on a cache clear.
→ Move to the server, rebuild. Or **delete it** if Goods Receipt covers it (my
recommendation: build GRN, drop Inward). **Decision needed.**

### Purchase list — `purchase-list`
A list that duplicates the Purchase screen's own list.
→ **Delete.** Fold into Purchase. **0.2 day.**

---

## 3 · Stock

### Items — `itemmaster`
The record every other screen depends on.
**Shape:** list first, full-page form on top. Labels left, fields right, blocks that
collapse. Already close to right.
Now: good structure, plain look, form flow just added. → Re-skin. **1 day.**

### Categories — `category`
**Shape:** two panes — categories left, items in the category right.
Now: separate old-styled screen. → Rebuild. **1 day.**

### Stock — `inventory`
"How much do I have, and what is about to run out."
**Shape:** one list, status chips (in stock / low / out / expiring), filter by chip —
not a dropdown. Reorder suggestion built in.
Now: old styling, no design system. → Rebuild. **1.5 days.**

### Stock adjustment — `stock-adjustment`
**Shape:** pick item → current qty shown → new qty → reason → save. One line at a time.
Now: server-backed, old styling. → Rebuild. **1 day.**

### Repacking — `repack`
Bag in, packets out.
Now: on the design system, works. → Re-skin only. **0.5 day.**

### Batches & expiry — `batches`
**Shape:** list sorted by expiry, colour by urgency, one click to block a batch.
Now: on the design system. → Re-skin. **0.5 day.**

### Barcode — `barcode`
**Shape:** left = what goes on the sticker (chips) · middle = the sticker at real size ·
right = how many of each. Printing engine untouched — it is good.
Now: engine strong, screen is old and dense. → Rebuild the screen. **1.5 days.**

### Stock updation — `stock-updation`
Overlaps Stock adjustment.
→ **Delete**, or make it the bulk-edit mode of Stock adjustment. **Decision needed.**

---

## 4 · Money

### Ledger — `ledger`
Who owes what.
**Shape:** party list with outstanding, click through to the statement. Age buckets as
chips (0–30 / 30–60 / 60+).
Now: on the design system. → Re-skin + ageing chips. **1 day.**

### Receipts — `receipt` · Payments — `payment`
Money in, money out. Same skeleton, opposite sign.
**Shape:** pick party → amount → the open bills allocate themselves → save.
Now: works, allocation is solid. → Re-skin. **1 day** for both.

### Books — `accounts`
Trial Balance, P&L, Balance Sheet, Day Book.
**Shape:** date range at the top, one report at a time, print and Excel on every one.
Now: on the design system. → Re-skin + export buttons. **1 day.**

---

## 5 · People

### Customers — `customers`
**Shape:** list → drawer with balance, last bills, credit limit. Not a separate screen.
Now: old styling. → Rebuild. **1 day.**

### Credit limits — `credit-limits`
**Shape:** party, limit, used, left — as a bar. Blocked parties red at the top.
Now: on the design system. → Re-skin. **0.5 day.**

### Users & roles — `users`
**Shape:** user list, role per user, a permission grid that fits on one screen.
→ Re-skin. **0.5 day.**

---

## 6 · Setup

**All of these become tabs in one Settings window.** That is the single biggest
usability win in the product — six places to hunt becomes one.

| Screen | Becomes | Note |
|---|---|---|
| `settings` | Settings › General | |
| `business-setup` | Settings › Business type | A preset button, not a lock |
| `numbering-settings` | Settings › Numbering | |
| `unit-settings` | Settings › Units & Scale | |
| `tax-master` | Settings › Taxes & GST | |
| `charges` | Settings › Charges | |
| *(new)* | Settings › Documents | Each document on/off + prefix |
| *(new)* | Settings › Sale screen | **Name + preview, pick one** |
| `print-templates` | Stays its own screen | Too big for a tab |

→ **3 days** for the window and moving the tabs.

### Print design — `print-templates`
**Shape:** left = what to print (checkbox groups from the 108-field catalogue) ·
right = live preview · a second mode for exact placement by dragging.
Now: drag canvas exists, fields hidden behind dropdowns. → Add the checkbox + preview
mode. **1.5 days.**

### The five small masters
`rate-master` · `size-master` · `brand-master` · `salesman` · `brandwise-rate` ·
`categorywise-rate`
**Shape:** one shared two-pane master screen — list left, form right — used six times.
Six screens become one component.
Now: six near-identical old screens, some still on localStorage.
→ One component, six configs. **2 days.**

---

## 7 · Seeing

### Dashboard — `dashboard`
The first screen of the day. It must answer: *how did yesterday go, and what needs me
today?*
**Shape:** four numbers across the top (sales, collection, outstanding, low stock),
one chart, then **a list of things to act on** — not more charts.
Now: charts without actions. → Rebuild the lower half. **1.5 days.**

### Reports — `report`
**Shape:** report list grouped (Sales / Purchase / Stock / GST / Accounts) → the report
with a date range → print and Excel on every one. GST JSON in the government's order.
Now: the frame exists, 12 reports missing.
→ Re-skin now, the missing reports separately. **1 day** now.

---

## Order of work

| # | What | Screens affected | Days |
|---|---|---|---|
| 1 | `tokens.css` + `index.jsx` — Direction B | **all 29** | 3 |
| | *stop — you look at 16 screens before I go on* | | |
| 2 | Settings window (six screens into tabs) + Sale screen picker | 8 | 3 |
| 3 | POS / Sale rebuilt | 1 | 2 |
| 4 | Restaurant tile panel | 1 | 3 |
| 5 | Barcode screen · Print screen | 2 | 3 |
| 6 | The six masters into one component | 6 | 2 |
| 7 | Old screens rebuilt (Stock, Categories, Customers, Purchase return, Stock adj.) | 5 | 5 |
| 8 | Dashboard lower half · Reports frame | 2 | 2.5 |
| | **Total** | | **23.5** |

Missing documents (Sales Return, PO, Quotation, Delivery Challan, GRN) are **not** in
this total — they are 8 more days and can run before or after.

---

## Three decisions I need

1. **Inward** — delete it and build Goods Receipt instead? (My answer: yes.)
2. **Stock updation** — delete, or make it the bulk mode of Stock adjustment?
   (My answer: bulk mode.)
3. **Purchase list** — delete and fold into Purchase? (My answer: yes.)

Nothing here is built until you say so.
