# Deployment Checklist

> Pre-launch gate for the Enterprise POS ERP. Derived from Milestone 5. **Do not deploy to production until every item is checked.** The DB/migration items directly resolve BUG-010.

## 1. Database & migrations *(BUG-010)*
- [ ] Migrations generated for **all** ~25 custom tables (`Server/src/migrations/`)
- [ ] `synchronize` disabled for production in `vendure-config.ts` (dev may keep it)
- [ ] Fresh DB + `npm run migration:run` reproduces the full schema
- [ ] Existing production-shaped DB upgrades via migrations **without data loss** (tested on a copy)
- [ ] App boots cleanly on the migrated DB
- [ ] Pre-migration DB dump taken and stored off-box

## 2. Environment & secrets
- [ ] `JWT_SECRET` set (strong, not the dev default) — POS auth
- [ ] Vendure `COOKIE_SECRET` / superadmin credentials set from env (not defaults)
- [ ] MySQL connection (`wow_vendurepos`) host/user/password configured for prod
- [ ] `NEXT_PUBLIC_VENDURE_API_URL` points at the prod API
- [ ] CORS origins restricted to the prod client host(s)
- [ ] `.env` files excluded from the image / repo

## 3. Build & container
- [ ] Server `npm run build` (tsc) succeeds; `dist/` runs via `node ./dist/index.js`
- [ ] Worker process starts (`dist/index-worker.js`)
- [ ] Client `next build` succeeds; `check-types` clean
- [ ] `docker-compose.yml` brings up server + worker + DB + client and passes a smoke test
- [ ] Asset server plugin serving `/assets` correctly
- [ ] Email plugin configured (real transport, not dev mailbox) if emails are used

## 4. Security *(run `/security-review`)*
- [ ] `/security-review` run on the release; no critical/high findings open
- [ ] Auth & permissions verified (POS JWT + Vendure roles); resolver `@Allow` guards intact
- [ ] No secrets or tokens logged
- [ ] Rate limiting / brute-force protection on login considered
- [ ] Input validation on all custom mutations reviewed

## 5. Data integrity & functional smoke test
- [ ] Stock invariant holds (`posStockIntegrityReport`: `SUM(ledger.qty) == snapshot.currentStock`)
- [ ] End-to-end: purchase → stock up → sale → stock down → ledger balances
- [ ] Sales return / purchase return adjust stock correctly
- [ ] GST reports (GSTR-1/3B) reconcile with `gstReport`
- [ ] Printing: invoice (thermal + A4), barcode/QR label via QZ Tray, browser fallback
- [ ] Reports export to PDF

## 6. Performance
- [ ] Key list queries paginated / bounded (items, sales, purchases)
- [ ] No obvious N+1 or full-table scans on hot paths
- [ ] Client bundle size acceptable; dashboard loads within target

## 7. Backup & recovery
- [ ] Automated DB backup schedule in place
- [ ] Restore procedure tested from a backup
- [ ] Asset/upload backup covered

## 8. Rollback readiness
- [ ] Previous image/tag retained for quick rollback
- [ ] Migration `down()` paths verified on a copy
- [ ] Documented rollback runbook
