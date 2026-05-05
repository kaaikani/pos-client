'use server';
import { mutate } from '@/lib/vendure/api';
import { RemoveFromCartMutation, AdjustCartItemMutation, ApplyPromotionCodeMutation, RemovePromotionCodeMutation } from '@/lib/vendure/mutations';
import { updateTag } from 'next/cache';
export async function removeFromCart(lineId) {
    await mutate(RemoveFromCartMutation, { lineId }, { useAuthToken: true });
    updateTag('cart');
}
export async function adjustQuantity(lineId, quantity) {
    await mutate(AdjustCartItemMutation, { lineId, quantity }, { useAuthToken: true });
    updateTag('cart');
}
export async function applyPromotionCode(formData) {
    const code = formData.get('code');
    if (!code)
        return;
    const res = await mutate(ApplyPromotionCodeMutation, { couponCode: code }, { useAuthToken: true });
    console.log({ res: res.data.applyCouponCode });
    updateTag('cart');
}
export async function removePromotionCode(formData) {
    const code = formData.get('code');
    if (!code)
        return;
    const res = await mutate(RemovePromotionCodeMutation, { couponCode: code }, { useAuthToken: true });
    console.log({ removeRes: res.data.removeCouponCode });
    updateTag('cart');
}
