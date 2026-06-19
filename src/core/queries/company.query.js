import { gql } from './gql';

// Seller company / GST identity — backed by the PosCompany entity (replaces the
// old localStorage-only company settings). localStorage may still be used as an
// optional cache, but the backend is the source of truth.

const COMPANY_FIELDS = `id companyName legalName gstin phone email address pincode stateName stateCode financialYear isActive status`;

/** Map a backend PosCompany → the shape the Settings UI uses (name/gst/state…). */
export function mapCompany(c) {
    if (!c) return null;
    return {
        id: String(c.id),
        name: c.companyName || '',
        legalName: c.legalName || '',
        gst: c.gstin || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        state: c.stateName || '',
        stateCode: c.stateCode || '',
        pincode: c.pincode || '',
        financialYear: c.financialYear || '',
        isActive: !!c.isActive,
    };
}

/** Build the GraphQL PosCompanyInput from the UI form shape. */
export function companyFormToInput(f) {
    return {
        companyName: (f.name || '').trim(),
        legalName: f.legalName || '',
        gstin: (f.gst || '').trim(),
        phone: f.phone || '',
        email: f.email || '',
        address: f.address || '',
        stateName: f.state || '',
        stateCode: (f.stateCode || '').trim(),
        pincode: f.pincode || '',
        financialYear: f.financialYear || '',
    };
}

export class PosCompaniesQuery {
    async execute() {
        const data = await gql(`query Companies { posCompanies { ${COMPANY_FIELDS} } }`, { useAdmin: true });
        return (data.posCompanies || []).map(mapCompany);
    }
}

export class PosActiveCompanyQuery {
    async execute() {
        const data = await gql(`query ActiveCompany { posActiveCompany { ${COMPANY_FIELDS} } }`, { useAdmin: true });
        return mapCompany(data.posActiveCompany);
    }
}

export class CreatePosCompanyCommand {
    async execute(input) {
        const data = await gql(
            `mutation CreateCompany($input: PosCompanyInput!) { createPosCompany(input: $input) { ${COMPANY_FIELDS} } }`,
            { useAdmin: true, variables: { input } },
        );
        return mapCompany(data.createPosCompany);
    }
}

export class UpdatePosCompanyCommand {
    async execute(id, input) {
        const data = await gql(
            `mutation UpdateCompany($id: ID!, $input: PosCompanyInput!) { updatePosCompany(id: $id, input: $input) { ${COMPANY_FIELDS} } }`,
            { useAdmin: true, variables: { id, input } },
        );
        return mapCompany(data.updatePosCompany);
    }
}

export class SetActivePosCompanyCommand {
    async execute(id) {
        const data = await gql(
            `mutation SetActive($id: ID!) { setActivePosCompany(id: $id) { id isActive } }`,
            { useAdmin: true, variables: { id } },
        );
        return data.setActivePosCompany;
    }
}

export class DeletePosCompanyCommand {
    async execute(id) {
        const data = await gql(
            `mutation DeleteCompany($id: ID!) { deletePosCompany(id: $id) { id status } }`,
            { useAdmin: true, variables: { id } },
        );
        return data.deletePosCompany;
    }
}
