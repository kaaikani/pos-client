import { gql } from './gql';
import { cachedFetch, invalidateCache } from './cache';

const LEDGER_TTL = 30_000; // 30s

export class GetLedgersQuery {
    async execute(type) {
        return cachedFetch(`ledger:list:${type}`, async () => {
            const data = await gql(`
                query Ledgers($type: LedgerType!) {
                    ledgers(type: $type) {
                        id type partyName invoiceNumber invoiceDate amount paidAmount balance status creditDays contactNumber gstNumber address
                        payments { id createdAt amount paymentDate paymentMode }
                    }
                }
            `, { useAdmin: true, variables: { type } });
            return data.ledgers;
        }, LEDGER_TTL);
    }
}

export class GetLedgerByIdQuery {
    async execute(id) {
        return cachedFetch(`ledger:one:${id}`, async () => {
            const data = await gql(`
                query Ledger($id: ID!) {
                    ledger(id: $id) {
                        id type partyName invoiceNumber invoiceDate amount paidAmount balance status creditDays contactNumber gstNumber address
                        payments { id createdAt amount paymentDate paymentMode }
                    }
                }
            `, { useAdmin: true, variables: { id } });
            return data.ledger;
        }, LEDGER_TTL);
    }
}

export class GetLedgerSummaryQuery {
    async execute() {
        return cachedFetch('ledger:summary', async () => {
            const data = await gql(`
                query LedgerSummary {
                    ledgerSummary { totalSales totalPurchase totalReceivable totalPayable }
                }
            `, { useAdmin: true });
            return data.ledgerSummary;
        }, LEDGER_TTL);
    }
}

export class AddPaymentCommand {
    async execute(ledgerId, input) {
        const data = await gql(`
            mutation AddPayment($ledgerId: ID!, $input: PaymentInput!) {
                addPayment(ledgerId: $ledgerId, input: $input) {
                    id type partyName invoiceNumber invoiceDate amount paidAmount balance status creditDays contactNumber gstNumber address
                    payments { id createdAt amount paymentDate paymentMode }
                }
            }
        `, { useAdmin: true, variables: { ledgerId, input: { amount: input.amount, paymentMode: input.paymentMode, paymentDate: input.paymentDate } } });
        // Invalidate after mutation
        invalidateCache('ledger:');
        return data.addPayment;
    }
}

export class CreateLedgerCommand {
    async execute(input) {
        const data = await gql(`
            mutation CreateLedger($input: CreateLedgerInput!) {
                createLedger(input: $input) {
                    id type partyName invoiceNumber invoiceDate amount paidAmount balance status creditDays contactNumber gstNumber address
                }
            }
        `, {
            useAdmin: true,
            variables: {
                input: {
                    type: input.type,
                    partyName: input.partyName,
                    invoiceNumber: input.invoiceNumber,
                    invoiceDate: input.invoiceDate,
                    amount: input.amount,
                    creditDays: input.creditDays || 30,
                    contactNumber: input.contactNumber || '',
                    gstNumber: input.gstNumber || '',
                    address: input.address || '',
                }
            }
        });
        invalidateCache('ledger:');
        return data.createLedger;
    }
}

// ══════════════════════════════════════════════════════════════
// BILL-WISE OUTSTANDING
// ══════════════════════════════════════════════════════════════
// The Ledger table is open-item — one row per invoice, carrying its own
// amount / paidAmount / balance. These three operations are what sits on top:
// a party roll-up with ageing, the open bills for one party, and applying a
// single receipt across several of them in one server transaction.
//
// Ageing is bucketed on DAYS OVERDUE (invoiceDate + creditDays), never on
// invoice age — that distinction is why the figures agree with the shop.

const PARTY_FIELDS = `
    partyName type contactNumber gstNumber address
    billCount openBillCount totalAmount paidAmount balance
    oldestOpenInvoiceDate maxDaysOverdue
    bucketCurrent bucket1_30 bucket31_60 bucket61_90 bucket90plus
`;

const OPEN_BILL_FIELDS = `
    id invoiceNumber invoiceDate dueDate creditDays
    amount paidAmount balance daysOverdue status
`;

export class LedgerPartiesQuery {
    async execute(type) {
        return cachedFetch(`ledger:parties:${type}`, async () => {
            const data = await gql(
                `query LedgerParties($t: LedgerType!) { ledgerParties(type: $t) { ${PARTY_FIELDS} } }`,
                { useAdmin: true, variables: { t: type } },
            );
            return data?.ledgerParties || [];
        }, 30_000);
    }
}

/** Not cached — the allocation grid must always see the current balance. */
export class LedgerOpenBillsQuery {
    async execute(type, partyName, contactNumber) {
        const data = await gql(
            `query LedgerOpenBills($t: LedgerType!, $p: String!, $c: String) {
                ledgerOpenBills(type: $t, partyName: $p, contactNumber: $c) { ${OPEN_BILL_FIELDS} }
            }`,
            { useAdmin: true, variables: { t: type, p: partyName, c: contactNumber || null } },
        );
        return data?.ledgerOpenBills || [];
    }
}

export class CommitLedgerAllocationCommand {
    async execute(input) {
        const data = await gql(
            `mutation CommitAllocation($input: CommitAllocationInput!) {
                commitLedgerAllocation(input: $input) {
                    docNo partyName type totalAmount allocated unapplied
                    bills { id invoiceNumber amount paidAmount balance status }
                }
            }`,
            { useAdmin: true, variables: { input } },
        );
        invalidateCache('ledger:');
        invalidateCache('pos:dashboard');
        return data.commitLedgerAllocation;
    }
}
