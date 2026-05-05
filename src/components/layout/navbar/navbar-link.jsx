'use client';
import { useSelectedLayoutSegment } from 'next/navigation';
import Link from 'next/link';
import { NavigationMenuLink, navigationMenuTriggerStyle, } from '@/components/ui/navigation-menu';
import { cn } from '@/lib/utils';
export function NavbarLink({ href, ...rest }) {
    const selectedLayoutSegment = useSelectedLayoutSegment();
    const pathname = selectedLayoutSegment ? `/${selectedLayoutSegment}` : '/';
    const isActive = pathname === href;
    return (<NavigationMenuLink asChild active={isActive}>
            <Link aria-current={isActive ? 'page' : undefined} className={cn(navigationMenuTriggerStyle())} href={href} {...rest}/>
        </NavigationMenuLink>);
}
