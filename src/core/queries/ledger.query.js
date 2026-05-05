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
