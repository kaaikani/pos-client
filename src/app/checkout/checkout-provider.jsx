'use client';
import { createContext, useContext, useState } from 'react';
const CheckoutContext = createContext(null);
export function CheckoutProvider({ children, order, addresses, countries, shippingMethods, paymentMethods, isGuest, }) {
    const [selectedPaymentMethodCode, setSelectedPaymentMethodCode] = useState(paymentMethods.length === 1 ? paymentMethods[0].code : null);
    return (<CheckoutContext.Provider value={{
            order,
            addresses,
            countries,
            shippingMethods,
            paymentMethods,
            selectedPaymentMethodCode,
            setSelectedPaymentMethodCode,
            isGuest,
        }}>
      {children}
    </CheckoutContext.Provider>);
}
export function useCheckout() {
    const context = useContext(CheckoutContext);
    if (!context) {
        throw new Error('useCheckout must be used within CheckoutProvider');
    }
    return context;
}
