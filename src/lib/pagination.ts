export function parsePagination(query: Record<string, string | undefined>) {
  let page = parseInt(query.page || '1', 10);
  let limit = parseInt(query.limit || '20', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
