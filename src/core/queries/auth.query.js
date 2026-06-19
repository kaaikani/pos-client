import { gql, getAuthToken, setAuthToken, clearAuthToken } from './gql';

// ══════════════════════════════════════════════════════════════
// VENDURE NATIVE LOGIN — uses Administrator + Role system
// ══════════════════════════════════════════════════════════════

/**
 * Detects role from the logged-in user's channels/permissions.
 * Returns: 'admin' if SuperAdmin or pos-admin role; 'user' otherwise
 */
function detectRole(currentUser, adminRoles = []) {
    const permissions = currentUser?.channels?.[0]?.permissions || [];
    const isSuperAdmin = permissions.includes('SuperAdmin');
    const roleCodes = adminRoles.map(r => r.code?.toLowerCase());
    const isPosAdmin = roleCodes.some(c => c === 'pos-admin' || c === '__super_admin_role__');
    if (isSuperAdmin || isPosAdmin) return 'admin';
    return 'user';
}

export class VendureLoginCommand {
    async execute(username, password) {
        // Clear any stale in-memory token before logging in.
        // Without this, a leftover Bearer header from a prior session can cause
        // the first login attempt to fail (server rejects mixed auth state),
        // requiring a second click to succeed.
        clearAuthToken();
        if (typeof window !== 'undefined') {
            try { localStorage.removeItem('pos_session'); } catch {}
        }

        const LOGIN_QUERY = `
            mutation VendureLogin($username: String!, $password: String!) {
                login(username: $username, password: $password) {
                    __typename
                    ... on CurrentUser {
                        id
                        identifier
                        channels { id code permissions }
                    }
                    ... on InvalidCredentialsError { message }
                    ... on NativeAuthStrategyError { message }
                }
            }
        `;
        const tryLogin = (id) => gql(LOGIN_QUERY, { useAdmin: true, skipAuth: true, variables: { username: id, password } });

        // 1) Try as-typed
        let data = await tryLogin(username.trim());
        let result = data.login;

        // 2) If failed and the input has no '@', retry with default domain (PosCreateUserCommand appends '@avsecom.local')
        if (result.__typename !== 'CurrentUser' && !username.includes('@')) {
            const retryEmail = `${username.trim()}@avsecom.local`;
            const retryData = await tryLogin(retryEmail);
            if (retryData.login.__typename === 'CurrentUser') {
                result = retryData.login;
            }
        }

        if (result.__typename !== 'CurrentUser') {
            throw new Error(result.message || 'Invalid username or password.');
        }

        // Role detection from channel permissions
        const permissions = result.channels?.[0]?.permissions || [];
        const adminPerms = ['SuperAdmin', 'UpdateAdministrator', 'CreateAdministrator', 'DeleteAdministrator'];
        const isAdmin = adminPerms.some(p => permissions.includes(p));

        return {
            token: getAuthToken() || 'vendure-session',
            userId: result.id,
            username: result.identifier,
            role: isAdmin ? 'admin' : 'user',
            displayName: result.identifier,
            permissions,
        };
    }
}

// ══════════════════════════════════════════════════════════════
// ME QUERY — validates the saved session is still alive
// Called on page load before auto-redirecting to /dashboard
// ══════════════════════════════════════════════════════════════
export class MeQuery {
    async execute() {
        try {
            const data = await gql(`
                query Me {
                    me {
                        id
                        identifier
                        channels { id code permissions }
                    }
                }
            `, { useAdmin: true, skipAuth: true });
            return data?.me || null;
        } catch (e) {
            return null;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// LOGOUT — clears session both server-side and locally
// ══════════════════════════════════════════════════════════════
export class LogoutCommand {
    async execute() {
        try {
            await gql(`mutation Logout { logout { success } }`, { useAdmin: true });
        } catch {}
        setAuthToken(null);
        if (typeof window !== 'undefined') localStorage.removeItem('pos_session');
    }
}

// ══════════════════════════════════════════════════════════════
// LIST ADMINISTRATORS (Vendure native — replaces PosListUsers)
// ══════════════════════════════════════════════════════════════
export class ListAdministratorsQuery {
    async execute() {
        const data = await gql(`
            query Admins {
                administrators(options: { take: 100 }) {
                    totalItems
                    items {
                        id createdAt firstName lastName emailAddress
                        user {
                            identifier
                            roles { id code description }
                        }
                    }
                }
            }
        `, { useAdmin: true });
        return (data.administrators?.items || []).map(a => ({
            id: a.id,
            username: a.user?.identifier || a.emailAddress,
            displayName: `${a.firstName} ${a.lastName}`.trim(),
            email: a.emailAddress,
            active: true,
            role: (a.user?.roles || []).some(r => r.code === 'pos-admin' || r.code === '__super_admin_role__') ? 'admin' : 'user',
            roles: (a.user?.roles || []).map(r => r.code),
            createdAt: a.createdAt,
        }));
    }
}

// ══════════════════════════════════════════════════════════════
// LIST ROLES
// ══════════════════════════════════════════════════════════════
export class ListRolesQuery {
    async execute() {
        try {
            const data = await gql(`
                query Roles {
                    roles(options: { take: 50 }) {
                        totalItems
                        items { id code description permissions }
                    }
                }
            `, { useAdmin: true });
            return data.roles?.items || [];
        } catch (e) {
            console.error('[ListRolesQuery]', e.message);
            return [];
        }
    }
}

// ══════════════════════════════════════════════════════════════
// GET SINGLE ROLE (with permissions)
// ══════════════════════════════════════════════════════════════
export class GetRoleQuery {
    async execute(id) {
        try {
            const data = await gql(`
                query Role($id: ID!) {
                    role(id: $id) { id code description permissions channels { id code } }
                }
            `, { useAdmin: true, variables: { id } });
            return data.role || null;
        } catch (e) {
            console.error('[GetRoleQuery]', e.message);
            return null;
        }
    }
}

// ══════════════════════════════════════════════════════════════
// UPDATE ROLE PERMISSIONS
// ══════════════════════════════════════════════════════════════
export class UpdateRolePermissionsCommand {
    async execute(id, permissions, description) {
        const input = { id, permissions };
        if (description !== undefined) input.description = description;
        const data = await gql(`
            mutation UpdateRole($input: UpdateRoleInput!) {
                updateRole(input: $input) { id code description permissions }
            }
        `, { useAdmin: true, variables: { input } });
        return data.updateRole;
    }
}

// ══════════════════════════════════════════════════════════════
// CREATE ADMINISTRATOR
// ══════════════════════════════════════════════════════════════
export class CreateAdministratorCommand {
    async execute({ firstName, lastName, emailAddress, password, role }) {
        const rolesData = await gql(`query { roles { items { id code } } }`, { useAdmin: true });
        const roles = rolesData.roles?.items || [];

        // ── Admin role selection ──
        const targetCode = role === 'admin' ? 'pos-admin' : 'pos-user';
        let roleMatch = roles.find(r => r.code === targetCode);

        // Fallback ONLY for admin (use SuperAdmin). For user, pos-user MUST exist.
        if (!roleMatch && role === 'admin') {
            roleMatch = roles.find(r => r.code === '__super_admin_role__');
        }

        if (!roleMatch) {
            throw new Error(`Role "${targetCode}" not found in Vendure. Create it first in GraphiQL or Vendure Dashboard.`);
        }

        const data = await gql(`
            mutation CreateAdmin($input: CreateAdministratorInput!) {
                createAdministrator(input: $input) {
                    id firstName lastName emailAddress
                    user { identifier roles { code } }
                }
            }
        `, {
            useAdmin: true,
            variables: {
                input: { firstName, lastName, emailAddress, password, roleIds: [roleMatch.id] }
            }
        });
        return data.createAdministrator;
    }
}

// ══════════════════════════════════════════════════════════════
// UPDATE ADMINISTRATOR
// ══════════════════════════════════════════════════════════════
export class UpdateAdministratorCommand {
    async execute(id, { firstName, lastName, emailAddress, password }) {
        const input = { id };
        if (firstName !== undefined) input.firstName = firstName;
        if (lastName !== undefined) input.lastName = lastName;
        if (emailAddress !== undefined) input.emailAddress = emailAddress;
        if (password) input.password = password;
        const data = await gql(`
            mutation UpdateAdmin($input: UpdateAdministratorInput!) {
                updateAdministrator(input: $input) {
                    id firstName lastName emailAddress
                }
            }
        `, { useAdmin: true, variables: { input } });
        return data.updateAdministrator;
    }
}

// ══════════════════════════════════════════════════════════════
// DELETE ADMINISTRATOR
// ══════════════════════════════════════════════════════════════
export class DeleteAdministratorCommand {
    async execute(id) {
        const data = await gql(`
            mutation DelAdmin($id: ID!) {
                deleteAdministrator(id: $id) { result message }
            }
        `, { useAdmin: true, variables: { id } });
        return data.deleteAdministrator?.result === 'DELETED';
    }
}

// ══════════════════════════════════════════════════════════════
// LEGACY ALIASES (keep old names working for existing UI code)
// ══════════════════════════════════════════════════════════════
export const PosLoginCommand = VendureLoginCommand;
export const PosListUsersQuery = ListAdministratorsQuery;
export const PosCreateUserCommand = class {
    async execute({ username, password, displayName, role }) {
        const parts = (displayName || username).trim().split(/\s+/);
        const firstName = parts[0] || username;
        const lastName = parts.slice(1).join(' ') || 'User';
        // username becomes email if no '@'
        const emailAddress = username.includes('@') ? username : `${username}@avsecom.local`;
        return new CreateAdministratorCommand().execute({ firstName, lastName, emailAddress, password, role });
    }
};
export const PosUpdateUserCommand = class {
    async execute(id, { displayName, password, active }) {
        const patch = {};
        if (displayName) {
            const parts = displayName.trim().split(/\s+/);
            patch.firstName = parts[0];
            patch.lastName = parts.slice(1).join(' ') || 'User';
        }
        if (password) patch.password = password;
        return new UpdateAdministratorCommand().execute(id, patch);
    }
};
export const PosDeleteUserCommand = DeleteAdministratorCommand;
