'use client';
export function Price({ value, currencyCode = 'USD' }) {
    return (<>
            {new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currencyCode,
        }).format(value / 100)}
        </>);
}
