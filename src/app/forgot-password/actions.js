'use server';
import { mutate } from '@/lib/vendure/api';
import { RequestPasswordResetMutation } from '@/lib/vendure/mutations';
export async function requestPasswordResetAction(prevState, formData) {
    const emailAddress = formData.get('emailAddress');
    if (!emailAddress) {
        return { error: 'Email address is required' };
    }
    try {
        const result = await mutate(RequestPasswordResetMutation, {
            emailAddress,
        });
        const resetResult = result.data.requestPasswordReset;
        if (resetResult?.__typename !== 'Success') {
            return { error: resetResult?.message || 'Failed to request password reset' };
        }
        return { success: true };
    }
    catch (error) {
        return { error: 'An unexpected error occurred. Please try again.' };
    }
}
