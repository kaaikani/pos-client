import {
    SalesReportQuery,
    PurchaseReportQuery,
    StockReportQuery,
    ExpenseReportQuery,
    DayBookQuery,
} from '../queries/reports.query';

/**
 * Report registry — the single place that defines every standardized report.
 *
 * Each descriptor declares its data source (a server-aggregated query), its
 * columns, how to derive table rows, and the totals band. The shared
 * ReportPreviewModal and the PDF builder are both driven entirely by these
 * descriptors, so all reports behave identically and adding a new one is a
 * single entry here.
 *
 * Column format types: 'text' | 'money' | 'number' | 'date'. Alignment is
 * derived from the type unless overridden.
 */

export const money = (n) =>
    '₹' +
    (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const num = (n) =>
    (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Format a single cell value for a column type (used by both HTML + PDF). */
export function formatCell(value, type) {
    switch (type) {
        case 'money':
            return money(value);
        case 'number':
            return num(value);
        case 'date':
        case 'text':
        default:
            return value == null || value === '' ? '—' : String(value);
    }
}

export const REPORTS = {
    sales: {
        id: 'sales',
        title: 'Sale Report',
        needsDateRange: true,
        runQuery: (from, to) => new SalesReportQuery().execute(from, to),
        columns: [
            { key: 'billDate', label: 'Date', type: 'date' },
            { key: 'billNo', label: 'Invoice No', type: 'text' },
            { key: 'customerName', label: 'Party Name', type: 'text' },
            { key: 'saleType', label: 'Type', type: 'text' },
            { key: 'grandTotal', label: 'Total', type: 'money' },
            { key: 'receivedAmount', label: 'Received', type: 'money' },
            { key: 'balanceDue', label: 'Balance', type: 'money' },
        ],
        buildRows: (d) => d?.bills || [],
        buildSummary: (d) => [
            { label: 'Bills', value: d?.billCount ?? 0, type: 'number' },
            { label: 'Total Sales', value: d?.totalAmount ?? 0, type: 'money' },
            { label: 'Cash', value: d?.cashTotal ?? 0, type: 'money' },
            { label: 'UPI', value: d?.upiTotal ?? 0, type: 'money' },
            { label: 'Card', value: d?.cardTotal ?? 0, type: 'money' },
            { label: 'Credit', value: d?.creditTotal ?? 0, type: 'money' },
            { label: 'Tax', value: d?.taxTotal ?? 0, type: 'money' },
            { label: 'Balance Due', value: d?.balanceDueTotal ?? 0, type: 'money' },
        ],
    },

    purchase: {
        id: 'purchase',
        title: 'Purchase Report',
        needsDateRange: true,
        runQuery: (from, to) => new PurchaseReportQuery().execute(from, to),
        columns: [
            { key: 'supplier', label: 'Supplier', type: 'text' },
            { key: 'billCount', label: 'Bills', type: 'number' },
            { key: 'taxable', label: 'Taxable', type: 'money' },
            { key: 'tax', label: 'Tax', type: 'money' },
            { key: 'discount', label: 'Discount', type: 'money' },
            { key: 'net', label: 'Net', type: 'money' },
        ],
        buildRows: (d) => d?.bySupplier || [],
        buildSummary: (d) => [
            { label: 'Bills', value: d?.billCount ?? 0, type: 'number' },
            { label: 'Taxable', value: d?.totalTaxable ?? 0, type: 'money' },
            { label: 'Tax', value: d?.totalTax ?? 0, type: 'money' },
            { label: 'Discount', value: d?.totalDiscount ?? 0, type: 'money' },
            { label: 'Net', value: d?.totalNet ?? 0, type: 'money' },
        ],
    },

    stock: {
        id: 'stock',
        title: 'Stock Report',
        needsDateRange: false,
        runQuery: () => new StockReportQuery().execute(),
        columns: [
            { key: 'code', label: 'Code', type: 'text' },
            { key: 'itemName', label: 'Item', type: 'text' },
            { key: 'unit', label: 'Unit', type: 'text' },
            { key: 'currentStock', label: 'Current Stock', type: 'number' },
            { key: 'minStock', label: 'Min', type: 'number' },
            { key: 'status', label: 'Status', type: 'text' },
        ],
        buildRows: (d) =>
            (d?.rows || []).map((r) => ({
                ...r,
                status: r.isLowStock ? 'LOW' : 'OK',
            })),
        buildSummary: (d) => [
            { label: 'Items', value: d?.itemCount ?? 0, type: 'number' },
            { label: 'Low Stock', value: d?.lowStockCount ?? 0, type: 'number' },
            { label: 'Stock-Tracked', value: d?.stockTrackedCount ?? 0, type: 'number' },
            { label: 'Total Units', value: d?.totalStockUnits ?? 0, type: 'number' },
        ],
    },

    expense: {
        id: 'expense',
        title: 'Expense Report',
        needsDateRange: true,
        runQuery: (from, to) => new ExpenseReportQuery().execute(from, to),
        columns: [
            { key: 'categoryName', label: 'Category', type: 'text' },
            { key: 'count', label: 'Count', type: 'number' },
            { key: 'taxable', label: 'Taxable', type: 'money' },
            { key: 'tax', label: 'Tax', type: 'money' },
            { key: 'net', label: 'Net', type: 'money' },
        ],
        buildRows: (d) => d?.byCategory || [],
        buildSummary: (d) => [
            { label: 'Expenses', value: d?.expenseCount ?? 0, type: 'number' },
            { label: 'Taxable', value: d?.totalTaxable ?? 0, type: 'money' },
            { label: 'Tax', value: d?.totalTax ?? 0, type: 'money' },
            { label: 'Net', value: d?.totalNet ?? 0, type: 'money' },
        ],
    },

    daybook: {
        id: 'daybook',
        title: 'Day Book',
        needsDateRange: true,
        runQuery: (from, to) => new DayBookQuery().execute(from, to),
        columns: [
            { key: 'date', label: 'Date', type: 'date' },
            { key: 'type', label: 'Type', type: 'text' },
            { key: 'refNo', label: 'Ref No', type: 'text' },
            { key: 'particulars', label: 'Particulars', type: 'text' },
            { key: 'mode', label: 'Mode', type: 'text' },
            { key: 'inAmount', label: 'In', type: 'money' },
            { key: 'outAmount', label: 'Out', type: 'money' },
        ],
        buildRows: (d) => d?.entries || [],
        buildSummary: (d) => [
            { label: 'Opening', value: d?.openingBalance ?? 0, type: 'money' },
            { label: 'Total In', value: d?.totalIn ?? 0, type: 'money' },
            { label: 'Total Out', value: d?.totalOut ?? 0, type: 'money' },
            { label: 'Net Flow', value: d?.netFlow ?? 0, type: 'money' },
            { label: 'Closing', value: d?.closingBalance ?? 0, type: 'money' },
        ],
    },
};

export function getReport(id) {
    return REPORTS[id] || null;
}
