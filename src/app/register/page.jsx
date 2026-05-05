import { Suspense } from 'react';
import { RegistrationForm } from "./registration-form";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
export const metadata = {
    title: 'Create Account',
    description: 'Create a new account to start shopping with us.',
};
function RegistrationFormSkeleton() {
    return (<Card>
            <CardContent className="space-y-4 pt-6">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24"/>
                    <Skeleton className="h-10 w-full"/>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20"/>
                        <Skeleton className="h-10 w-full"/>
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-20"/>
                        <Skeleton className="h-10 w-full"/>
                    </div>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-36"/>
                    <Skeleton className="h-10 w-full"/>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16"/>
                    <Skeleton className="h-10 w-full"/>
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-32"/>
                    <Skeleton className="h-10 w-full"/>
                </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 mt-4">
                <Skeleton className="h-10 w-full"/>
                <Skeleton className="h-4 w-44 mx-auto"/>
            </CardFooter>
        </Card>);
}
async function RegisterContent({ searchParams }) {
    const resolvedParams = await searchParams;
    const redirectTo = resolvedParams?.redirectTo;
    return <RegistrationForm redirectTo={redirectTo}/>;
}
export default async function RegisterPage({ searchParams }) {
    return (<div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-md space-y-6">
                <div className="space-y-2 text-center">
                    <h1 className="text-3xl font-bold">Create Account</h1>
                    <p className="text-muted-foreground">
                        Sign up to start shopping with us
                    </p>
                </div>
                <Suspense fallback={<RegistrationFormSkeleton />}>
                    <RegisterContent searchParams={searchParams}/>
                </Suspense>
            </div>
        </div>);
}
