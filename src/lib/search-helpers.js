export function buildSearchInput({ searchParams, collectionSlug }) {
    const page = Number(searchParams.page) || 1;
    const take = 12;
    const skip = (page - 1) * take;
    const sort = searchParams.sort || 'name-asc';
    const searchTerm = searchParams.q;
    // Extract facet value IDs from search params
    const facetValueIds = searchParams.facets
        ? Array.isArray(searchParams.facets)
            ? searchParams.facets
            : [searchParams.facets]
        : [];
    // Map sort parameter to Vendure SearchResultSortParameter
    const sortMapping = {
        'name-asc': { name: 'ASC' },
        'name-desc': { name: 'DESC' },
        'price-asc': { price: 'ASC' },
        'price-desc': { price: 'DESC' },
    };
    return {
        ...(searchTerm && { term: searchTerm }),
        ...(collectionSlug && { collectionSlug }),
        take,
        skip,
        groupByProduct: true,
        sort: sortMapping[sort] || sortMapping['name-asc'],
        ...(facetValueIds.length > 0 && {
            facetValueFilters: facetValueIds.map(id => ({ and: id }))
        })
    };
}
export function getCurrentPage(searchParams) {
    return Number(searchParams.page) || 1;
}
