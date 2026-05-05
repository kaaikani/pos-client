'use client';
import { createContext, useContext } from 'react';
const AuthContext = createContext(undefined);
export function AuthProvider({ children, initialActiveCustomerPromise }) {
    return (<AuthContext.Provider value={{ activeCustomer: initialActiveCustomerPromise }}>
            {children}
        </AuthContext.Provider>);
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
