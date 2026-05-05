// ----------------------------------------------------
// IQUERY IMPLEMENTATIONS (Business Logic Layer)
// ----------------------------------------------------
export class GetLedgerSummaryQuery {
    async execute() {
        // Transformer & Logic: Do not call GraphQL directly from UI
        // Mocking real-time transformation from Vendure
        return {
            totalSales: 852000,
            totalPurchase: 412000,
            totalReceivable: 45000,
            totalPayable: 112000
        };
    }
}
export class GetCustomerLedgerQuery {
    async execute() {
        return [
            {
                id: 'C-001',
                name: 'Arun Stores',
                entityId: 'V-CUST-1002',
                invoiceNumber: 'INV-2026-641',
                invoiceDate: '2026-03-25T10:00:00Z',
                totalAmount: 12500,
                paidAmount: 5500,
                balanceAmount: 7000,
                paymentMode: 'Credit',
                creditDays: 30,
                creditLimit: 50000,
                status: 'Partial',
                payments: [
                    { date: '2026-03-25T10:00:00Z', amount: 3000, mode: 'UPI' },
                    { date: '2026-03-28T14:30:00Z', amount: 2500, mode: 'Bank' }
                ]
            },
            {
                id: 'C-002',
                name: 'Kumar Organics',
                entityId: 'V-CUST-1015',
                invoiceNumber: 'INV-2026-642',
                invoiceDate: '2026-03-26T11:20:00Z',
                totalAmount: 4500,
                paidAmount: 4500,
                balanceAmount: 0,
                paymentMode: 'UPI',
                creditDays: 15,
                creditLimit: 10000,
                status: 'Paid',
                payments: [
                    { date: '2026-03-26T11:20:00Z', amount: 4500, mode: 'UPI' }
                ]
            }
        ];
    }
}
export class GetSupplierLedgerQuery {
    async execute() {
        return [
            {
                id: 'S-001',
                name: 'Hindustan Unilever Dist.',
                entityId: 'V-SUP-811',
                invoiceNumber: 'PO-2026-015',
                invoiceDate: '2026-03-20T09:15:00Z',
                totalAmount: 45000,
                paidAmount: 20000,
                balanceAmount: 25000,
                paymentMode: 'Bank',
                creditDays: 60,
                status: 'Pending',
                payments: [
                    { date: '2026-03-21T10:00:00Z', amount: 20000, mode: 'Bank' }
                ]
            },
            {
                id: 'S-002',
                name: 'Tata Consumer Products',
                entityId: 'V-SUP-833',
                invoiceNumber: 'PO-2026-016',
                invoiceDate: '2026-03-28T16:45:00Z',
                totalAmount: 18000,
                paidAmount: 0,
                balanceAmount: 18000,
                paymentMode: 'Credit',
                creditDays: 30,
                status: 'Pending',
                payments: []
            }
        ];
    }
}
export class AddPaymentCommand {
    async execute(input) {
        // Transformer & Logic: Sends mutation to generic GraphQL handler
        console.log('Sending AddPaymentCommand to API Layer...', input);
        // Pretend successful update of the balance in the db
        return true;
    }
}
