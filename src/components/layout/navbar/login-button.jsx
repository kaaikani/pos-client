'use client';
import { useTransition } from "react";
import { logoutAction } from "@/app/sign-in/actions";
import { useRouter } from "next/navigation";
export function LoginButton({ isLoggedIn, ...props }) {
    const [isPending, startTransition] = useTransition();
    const router = useRouter();
    return (<button {...props} aria-disabled={isPending} onClick={() => {
            if (isLoggedIn) {
                startTransition(async () => {
                    await logoutAction();
                });
            }
            else {
                router.push('/sign-in');
            }
        }}>
            {isLoggedIn ? 'Sign out' : 'Sign in'}
        </button>);
}
