import { Suspense } from 'react';
import { OrderConfirmation } from './order-confirmation';
import { noIndexRobots } from '@/lib/metadata';
export const metadata = {
    title: 'Order Confirmation',
    description: 'Your order has been placed successfully.',
    robots: noIndexRobots(),
};
export default async function OrderConfirmationPage(props) {
    return (<Suspense fallback={<div className="container mx-auto px-4 py-16 text-center">Loading...</div>}>
            <OrderConfirmation {...props}/>
        </Suspense>);
}
