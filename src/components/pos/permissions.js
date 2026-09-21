"use client";
/**
 * Role-based access control.
 *
 * Access is decided by the Vendure permissions the logged-in user's role carries,
 * NOT by a single `role === 'admin'` boolean. `VendureLoginCommand` already returns
 * `channels[0].permissions`; the login page stores them on the session and this
 * module turns them into per-screen and per-action decisions.
 *
 * Nothing here is a security boundary — the server enforces permissions on every
 * resolver. This exists so the UI does not offer actions that will be refused.
 */

/** Vendure permission strings used by this app. */
export const P = {
    SuperAdmin: 'SuperAdmin',
    ReadCatalog: 'ReadCatalog', CreateCatalog: 'CreateCatalog',
    UpdateCatalog: 'UpdateCatalog', DeleteCatalog: 'DeleteCatalog',
    ReadOrder: 'ReadOrder', CreateOrder: 'CreateOrder',
    UpdateOrder: 'UpdateOrder', DeleteOrder: 'DeleteOrder',
    ReadCustomer: 'ReadCustomer', CreateCustomer: 'CreateCustomer',
    UpdateCustomer: 'UpdateCustomer', DeleteCustomer: 'DeleteCustomer',
    ReadSettings: 'ReadSettings', UpdateSettings: 'UpdateSettings',
    ReadAdministrator: 'ReadAdministrator', CreateAdministrator: 'CreateAdministrator',
    UpdateAdministrator: 'UpdateAdministrator', DeleteAdministrator: 'DeleteAdministrator',
};

/**
 * Screen → the permission needed to open it.
 * A screen with no entry is open to any authenticated user.
 */
export const SCREEN_PERMISSION = {
    home:               null,
    dashboard:          P.ReadOrder,
    pos:                P.CreateOrder,
    token:              P.CreateOrder,
    itemmaster:         P.ReadCatalog,
    category:           P.ReadCatalog,
    barcode:            P.ReadCatalog,
    'tax-master':       P.ReadCatalog,   // viewing rates; editing needs settings.update
    // Both change how documents are numbered and how quantities convert, which
    // affects every bill from that point on — an owner-level decision.
    'unit-settings':    P.UpdateSettings,
    'numbering-settings': P.UpdateSettings,
    // Changing a bill layout changes every document printed from then on.
    'print-templates':  P.UpdateSettings,
    // Choosing a business type changes what the whole application offers.
    'business-setup':   P.UpdateSettings,
    inventory:          P.ReadCatalog,
    'stock-updation':   P.UpdateCatalog,
    repack:             P.UpdateCatalog,
    batches:            P.ReadCatalog,
    // What the shop adds to every bill is an owner-level decision.
    charges:            P.UpdateSettings,
    // A waiter opens tables and rings orders, which is the till's own right.
    restaurant:         P.CreateOrder,
    // How much a buyer may owe is an owner's call, not a till operator's.
    'credit-limits':    P.UpdateCustomer,
    'stock-adjustment': P.UpdateCatalog,
    purchase:           P.ReadCatalog,
    'purchase-list':    P.ReadCatalog,
    'purchase-return':  P.UpdateCatalog,
    inward:             P.UpdateCatalog,
    customers:          P.ReadCustomer,
    // Trial Balance, P and L and Balance Sheet expose the whole business, so
    // reading them is a settings-level permission rather than an order one.
    accounts:           P.ReadSettings,
    ledger:             P.ReadOrder,
    payment:            P.ReadOrder,
    receipt:            P.ReadOrder,
    report:             P.ReadOrder,
    users:              P.ReadAdministrator,
    settings:           P.ReadSettings,
};

/**
 * Action → permission. Used to disable Save/Delete buttons for read-only roles
 * instead of letting the user fill a form and then be refused by the server.
 */
export const ACTION_PERMISSION = {
    'item.create':      P.CreateCatalog,
    'item.update':      P.UpdateCatalog,
    'item.delete':      P.DeleteCatalog,
    'purchase.create':  P.CreateCatalog,
    'purchase.delete':  P.DeleteCatalog,
    'stock.adjust':     P.UpdateCatalog,
    'sale.create':      P.CreateOrder,
    'sale.delete':      P.DeleteOrder,
    'customer.create':  P.CreateCustomer,
    'customer.update':  P.UpdateCustomer,
    'customer.delete':  P.DeleteCustomer,
    // Money-in / money-out change settled state, so a ReadOrder viewer can open
    // the screen but cannot save. Collecting is UpdateOrder, not CreateOrder.
    'receipt.create':   P.UpdateOrder,
    'payment.create':   P.UpdateOrder,
    'user.manage':      P.UpdateAdministrator,
    'settings.update':  P.UpdateSettings,
};

/** SuperAdmin implies everything. */
export function hasPermission(permissions, needed) {
    if (!needed) return true;
    const list = permissions || [];
    if (list.includes(P.SuperAdmin)) return true;
    return Array.isArray(needed) ? needed.some(n => list.includes(n)) : list.includes(needed);
}

export function canOpenScreen(permissions, screenId) {
    return hasPermission(permissions, SCREEN_PERMISSION[screenId]);
}

export function canDo(permissions, action) {
    return hasPermission(permissions, ACTION_PERMISSION[action]);
}

/**
 * Read the session written by the login page.
 * `permissions` may be absent on a session created before RBAC was added — in that
 * case fall back to the coarse role so an existing login is not locked out.
 */
export function readSession() {
    if (typeof window === 'undefined') return null;
    try {
        const s = JSON.parse(localStorage.getItem('pos_session') || 'null');
        if (!s) return null;
        if (!Array.isArray(s.permissions)) {
            s.permissions = s.role === 'admin' ? [P.SuperAdmin] : [P.CreateOrder, P.ReadCatalog, P.ReadCustomer];
        }
        return s;
    } catch {
        return null;
    }
}

/** A short human label for the role, shown next to the user in the sidebar. */
export function roleLabel(session) {
    const perms = session?.permissions || [];
    if (perms.includes(P.SuperAdmin)) return 'Super Admin';
    if (perms.includes(P.UpdateAdministrator)) return 'Administrator';
    if (perms.includes(P.UpdateCatalog)) return 'Manager';
    if (perms.includes(P.CreateOrder)) return 'Cashier';
    return 'User';
}
