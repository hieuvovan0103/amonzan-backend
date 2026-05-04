export function getPaginationRange(page = 1, limit = 12) {
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);

    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

    return {
        page: safePage,
        limit: safeLimit,
        from,
        to,
    };
}

export function buildPaginationMeta(params: {
    page: number;
    limit: number;
    total: number;
}) {
    const { page, limit, total } = params;
    const totalPages = Math.ceil(total / limit);

    return {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
    };
}