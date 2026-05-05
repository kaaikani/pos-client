'use server';
import { mutate } from '@/lib/vendure/api';
import { RegisterCustomerAccountMutation } from '@/lib/vendure/mutations';
import { redirect } from 'next/navigation';
export async function registerAction(prevState, formData) {
    const emailAddress = formData.get('emailAddress');
    const firstName = formData.get('firstName');
    const lastName = formData.get('lastName');
    const phoneNumber = formData.get('phoneNumber');
    const password = formData.get('password');
    const redirectTo = formData.get('redirectTo');
    if (!emailAddress || !password) {
        return { error: 'Email address and password are required' };
    }
    const result = await mutate(RegisterCustomerAccountMutation, {
        input: {
            emailAddress,
            firstName: firstName || undefined,
            lastName: lastName || undefined,
            phoneNumber: phoneNumber || undefined,
            password,
        }
    });
    const registerResult = result.data.registerCustomerAccount;
    if (registerResult.__typename !== 'Success') {
        return { error: registerResult.message };
    }
    // Redirect to verification pending page, preserving redirectTo if present
    const verifyUrl = redirectTo
        ? `/verify-pending?redirectTo=${encodeURIComponent(redirectTo)}`
        : '/verify-pending';
    redirect(verifyUrl);
}
