"use client";
/**
 * Dashboard shell.
 *
 * Loads the POS design tokens for every module under /dashboard, and mounts the
 * app-level confirm dialog so modules can `await confirm(...)` instead of calling
 * the blocking browser `window.confirm`.
 */
import React from 'react';
import '../../components/pos/tokens.css';
import { ConfirmProvider } from '../../components/pos';
import { BusinessProfileProvider } from '../../components/pos/profile';

export default function DashboardLayout({ children }) {
    return (
        <BusinessProfileProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
        </BusinessProfileProvider>
    );
}
