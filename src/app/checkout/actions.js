'use server';
import { mutate } from '@/lib/vendure/api';
import { SetOrderShippingAddressMutation, SetOrderBillingAddressMutation, SetOrderShippingMethodMutation, AddPaymentToOrderMutation, CreateCustomerAddressMutation, TransitionOrderToStateMutation, SetCustomerForOrderMutation, } from '@/lib/vendure/mutations';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from "next/navigation";
export async function setShippingAddress(shippingAddress, useSameForBilling) {
    const shippingResult = await mutate(SetOrderShippingAddressMutation, { input: shippingAddress }, { useAuthToken: true });
    if (shippingResult.data.setOrderShippingAddress.__typename !== 'Order') {
        throw new Error('Failed to set shipping address');
    }
    if (useSameForBilling) {
        await mutate(SetOrderBillingAddressMutation, { input: shippingAddress }, { useAuthToken: true });
    }
    revalidatePath('/checkout');
}
export async function setShippingMethod(shippingMethodId) {
    const result = await mutate(SetOrderShippingMethodMutation, { shippingMethodId: [shippingMethodId] }, { useAuthToken: true });
    if (result.data.setOrderShippingMethod.__typename !== 'Order') {
        throw new Error('Failed to set shipping method');
    }
    revalidatePath('/checkout');
}
export async function createCustomerAddress(address) {
    const result = await mutate(CreateCustomerAddressMutation, { input: address }, { useAuthToken: true });
    if (!result.data.createCustomerAddress) {
        throw new Error('Failed to create customer address');
    }
    revalidatePath('/checkout');
    return result.data.createCustomerAddress;
}
export async function transitionToArrangingPayment() {
    const result = await mutate(TransitionOrderToStateMutation, { state: 'ArrangingPayment' }, { useAuthToken: true });
    if (result.data.transitionOrderToState?.__typename === 'OrderStateTransitionError') {
        const errorResult = result.data.transitionOrderToState;
        throw new Error(`Failed to transition order state: ${errorResult.errorCode} - ${errorResult.message}`);
    }
    revalidatePath('/checkout');
}
export async function placeOrder(paymentMethodCode) {
    // First, transition the order to ArrangingPayment state
    await transitionToArrangingPayment();
    // Prepare metadata based on payment method
    const metadata = {};
    // For standard payment, include the required fields
    if (paymentMethodCode === 'standard-payment') {
        metadata.shouldDecline = false;
        metadata.shouldError = false;
        metadata.shouldErrorOnSettle = false;
    }
    // Add payment to the order
    const result = await mutate(AddPaymentToOrderMutation, {
        input: {
            method: paymentMethodCode,
            metadata,
        },
    }, { useAuthToken: true });
    if (result.data.addPaymentToOrder.__typename !== 'Order') {
        const errorResult = result.data.addPaymentToOrder;
        throw new Error(`Failed to place order: ${errorResult.errorCode} - ${errorResult.message}`);
    }
    const orderCode = result.data.addPaymentToOrder.code;
    // Update the cart tag to immediately invalidate cached cart data
    updateTag('cart');
    updateTag('active-order');
    redirect(`/order-confirmation/${orderCode}`);
}
export async function setCustomerForOrder(input) {
    const result = await mutate(SetCustomerForOrderMutation, { input }, { useAuthToken: true });
    const response = result.data.setCustomerForOrder;
    switch (response.__typename) {
        case 'Order':
            revalidatePath('/checkout');
            return { success: true };
        case 'AlreadyLoggedInError':
            return { success: true };
        case 'EmailAddressConflictError':
            return { success: false, errorCode: 'EMAIL_CONFLICT', message: response.message };
        case 'GuestCheckoutError':
            return { success: false, errorCode: 'GUEST_CHECKOUT_DISABLED', message: response.message };
        case 'NoActiveOrderError':
            return { success: false, errorCode: 'NO_ACTIVE_ORDER', message: response.message };
        default:
            return { success: false, errorCode: 'UNKNOWN', message: 'Unknown error' };
    }
}
