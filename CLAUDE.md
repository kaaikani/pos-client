# CLIENT — AVS ECOM HUB POS

**The engineering rules for this project live in `../CLAUDE.md` (the repository root).**
Read that file first. It is the master prompt — analysis before code, no guessing, approval
gate, verification before claiming completion. Everything below only adds frontend detail;
it never overrides the root file.

The root file is loaded automatically when the working directory is inside `d:\POS_API`.
If you are working with `Client` opened on its own, open `../CLAUDE.md` explicitly.

---

## What this is

Next.js 16 (Turbopack) + React 19 + Tailwind. Runs on **port 3007**. Talks to the Vendure
server on **port 3006** (`NEXT_PUBLIC_VENDURE_API_URL` in `.env.local`).

Ports 3000 and 3005 belong to the separate DeliveryPartner project. Do not take them.

```
npm run dev            → http://localhost:3007
npm run check-types    → tsc --noEmit
```

## Structure

| Path | Holds |
|---|---|
| `src/app/dashboard/page.jsx` | The single dashboard route. Screen is React state, not a URL segment. Holds the screen switch, nav, permissions and history handling. |
| `src/app/dashboard/*-module.jsx` | One file per screen. |
| `src/components/pos/` | The design system — tokens, primitives, sidebar, topbar, printing. |
| `src/core/queries/` | Every GraphQL call, as `*Query` / `*Command` classes with caching. |

## Adding a screen — all four, or it is unreachable

1. `src/app/dashboard/<name>-module.jsx` — the screen
2. `page.jsx` — import it and add a `case` to the switch
3. `components/pos/sidebar.jsx` — a `NAV_GROUPS` entry
4. `components/pos/permissions.js` — a `SCREEN_PERMISSION` entry

Skipping 3 or 4 is a live bug in this codebase today: nine screens are routed but have no
nav entry, so nothing in the UI reaches them.

## Design system — use it, do not re-invent it

* Tokens: `components/pos/tokens.css`. Every colour comes from a `--pos-*` variable so both
  light and dark work. Never hardcode a hex.
* Primitives: `components/pos/index.jsx` — `Page`, `PageHeader`, `PageBody`, `Card`,
  `DataTable`, `Field`, `Input`, `Select`, `Button`, `Banner`, `EmptyState`, `money`,
  `useConfirm`, `useFieldFlow`. Compose these.
* Forms: `components/pos/form.jsx`. Printing: `components/pos/voucher-print.jsx`.
* **Accent colour** is for the one primary button per screen and the focus ring. Not for
  bill numbers, SKUs, names, headings, badges or chart series — those are ink.
* **`PageBody` with `flex flex-col` shrinks its children.** Give cards `className="shrink-0"`
  or their buttons get clipped.
* **Tailwind loses to `.pos-input`'s own padding.** Prefix with `!` when overriding
  (`!pl-8`), or the utility is silently ignored.
* No new `alert()` or `confirm()`. Use `useConfirm()` and `Banner`.

## Data rules

* **Amounts are RUPEES.** The ledger stores rupees, not paise. Never divide by 100.
* The server owns business logic. The client must not create a ledger row, compute a tax
  total, or decide a document number — `createSale` already does all three, in one
  transaction.
* After any mutation that touches money, invalidate the caches it affects:
  `invalidateCache('ledger:')`, `invalidateDashboard()`. A stale list after a save is a bug
  the operator reads as "my entry did nothing".
* Never add a control that does nothing. A search box with no handler or a bell with no
  behaviour is worse than no control — it teaches the operator not to trust the screen.

## Verification

`npm run check-types` passing is not verification. Open the screen on localhost:3007, drive
it, confirm the database changed, remove any test data, and say what you actually checked.
