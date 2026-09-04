import { gql } from './gql';
import { cachedFetch, invalidateCache } from './cache';

/**
 * Dashboard — ONE call for the whole home screen.
 *
 * The server assembles KPIs, the sales/profit series, cash flow, the inventory
 * snapshot, top sellers, the recent-activity feed and the alert list in a single
 * resolver (`posDashboard`), reusing the same services behind the sales report,
 * day book, stock report and ledger. The screen therefore costs one round trip
 * instead of the five it would take to gather these separately.
 */
const DASHBOARD_FIELDS = `
    fromDate toDate costBasis
    salesValue salesPrevious salesChangePct billCount
    grossProfit grossProfitPrevious grossProfitChangePct
    receivable receivableOverdue payable payableDue
    cashIn cashOut netCashFlow availableCash
    series { date sales profit }
    productCount lowStockCount outOfStockCount stockValue
    lowStockItems { itemCode itemName currentStock reorderLevel }
    topProducts { itemCode itemName qtySold salesValue }
    recentTransactions { kind recordId refNo party amount paymentMode status at screen }
    alerts { severity code message count amount screen }
`;

export class PosDashboardQuery {
    async execute(fromDate, toDate) {
        const key = `pos:dashboard:${fromDate}:${toDate || fromDate}`;
        return cachedFetch(key, async () => {
            const data = await gql(
                `query PosDashboard($f: String!, $t: String) { posDashboard(fromDate: $f, toDate: $t) { ${DASHBOARD_FIELDS} } }`,
                { useAdmin: true, variables: { f: fromDate, t: toDate || null } },
            );
            return data?.posDashboard || null;
        }, 60_000);
    }
}

/** Call after any write that changes sales, stock or money. */
export function invalidateDashboard() {
    invalidateCache('pos:dashboard');
}
