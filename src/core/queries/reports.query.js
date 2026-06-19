import { gql } from './gql';

/**
 * Frontend query classes for the SERVER-AGGREGATED report endpoints.
 *
 * These deliberately call the backend's pre-aggregated report queries
 * (pharmaSalesReport, purchaseReport, pharmaCurrentStock, expenseReport,
 * dayBook) rather than raw lists. All totals/tax/groupings are computed
 * server-side — the frontend only renders them. This is the audit-safe path:
 * the number shown in the table and the PDF is the number the server produced.
 */

export class SalesReportQuery {
    async execute(fromDate, toDate) {
        const data = await gql(
            `query SalesReport($f: String, $t: String) {
                pharmaSalesReport(fromDate: $f, toDate: $t) {
                    fromDate toDate billCount totalAmount
                    cashTotal upiTotal cardTotal chequeTotal onlineTotal
                    creditTotal balanceDueTotal discountTotal taxTotal
                    bills {
                        id billNo billDate billTime saleType
                        customerName customerPhone salesMan
                        grandTotal cashAmount upiAmount cardAmount chequeAmount onlineAmount
                        receivedAmount balanceDue
                    }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate || null, t: toDate || null } },
        );
        return data.pharmaSalesReport;
    }
}

export class PurchaseReportQuery {
    async execute(fromDate, toDate) {
        const data = await gql(
            `query PurchaseReport($f: String!, $t: String) {
                purchaseReport(fromDate: $f, toDate: $t) {
                    fromDate toDate billCount totalTaxable totalTax totalDiscount totalNet
                    bySupplier { supplier billCount taxable tax discount net }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate, t: toDate || null } },
        );
        return data.purchaseReport;
    }
}

export class StockReportQuery {
    async execute(opts = {}) {
        const data = await gql(
            `query StockReport($low: Boolean, $tracked: Boolean) {
                pharmaCurrentStock(onlyLowStock: $low, onlyStockBased: $tracked) {
                    itemCount lowStockCount stockTrackedCount totalStockUnits
                    rows { code itemName unit salesRate mrpRate currentStock minStock maxStock isStockBased isLowStock }
                }
            }`,
            { useAdmin: true, variables: { low: !!opts.onlyLowStock, tracked: !!opts.onlyStockBased } },
        );
        return data.pharmaCurrentStock;
    }
}

export class ExpenseReportQuery {
    async execute(fromDate, toDate) {
        const data = await gql(
            `query ExpenseReport($f: String!, $t: String) {
                expenseReport(fromDate: $f, toDate: $t) {
                    fromDate toDate expenseCount totalTaxable totalTax totalNet
                    byCategory { categoryId categoryName count taxable tax net }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate, t: toDate || null } },
        );
        return data.expenseReport;
    }
}

export class DayBookQuery {
    async execute(fromDate, toDate) {
        const data = await gql(
            `query DayBook($f: String!, $t: String) {
                dayBook(fromDate: $f, toDate: $t) {
                    fromDate toDate openingBalance totalIn totalOut netFlow closingBalance
                    entries { date type refNo particulars mode inAmount outAmount }
                }
            }`,
            { useAdmin: true, variables: { f: fromDate, t: toDate || null } },
        );
        return data.dayBook;
    }
}
