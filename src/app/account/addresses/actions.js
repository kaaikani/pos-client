'use server';
import { mutate } from '@/lib/vendure/api';
import { CreateCustomerAddressMutation, UpdateCustomerAddressMutation, DeleteCustomerAddressMutation, } from '@/lib/vendure/mutations';
import { revalidatePath } from 'next/cache';
export async function createAddress(address) {
    const result = await mutate(CreateCustomerAddressMutation, { input: address }, { useAuthToken: true });
    if (!result.data.createCustomerAddress) {
        throw new Error('Failed to create address');
    }
    revalidatePath('/account/addresses');
    return result.data.createCustomerAddress;
}
export async function updateAddress(address) {
    const { id, ...input } = address;
    const result = await mutate(UpdateCustomerAddressMutation, {
        input: {
            id,
            fullName: input.fullName,
            streetLine1: input.streetLine1,
            streetLine2: input.streetLine2,
            city: input.city,
            province: input.province,
            postalCode: input.postalCode,
            countryCode: input.countryCode,
            phoneNumber: input.phoneNumber,
            company: input.company,
        },
    }, { useAuthToken: true });
    if (!result.data.updateCustomerAddress) {
        throw new Error('Failed to update address');
    }
    revalidatePath('/account/addresses');
    return result.data.updateCustomerAddress;
}
export async function deleteAddress(id) {
    const result = await mutate(DeleteCustomerAddressMutation, { id }, { useAuthToken: true });
    if (!result.data.deleteCustomerAddress.success) {
        throw new Error('Failed to delete address');
    }
    revalidatePath('/account/addresses');
    return result.data.deleteCustomerAddress;
}
export async function setDefaultShippingAddress(id) {
    const result = await mutate(UpdateCustomerAddressMutation, {
        input: {
            id,
            defaultShippingAddress: true,
        },
    }, { useAuthToken: true });
    if (!result.data.updateCustomerAddress) {
        throw new Error('Failed to set default shipping address');
    }
    revalidatePath('/account/addresses');
    return result.data.updateCustomerAddress;
}
export async function setDefaultBillingAddress(id) {
    const result = await mutate(UpdateCustomerAddressMutation, {
        input: {
            id,
            defaultBillingAddress: true,
        },
    }, { useAuthToken: true });
    if (!result.data.updateCustomerAddress) {
        throw new Error('Failed to set default billing address');
    }
    revalidatePath('/account/addresses');
    return result.data.updateCustomerAddress;
}
