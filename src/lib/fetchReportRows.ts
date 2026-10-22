type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

const PAGE_SIZE = 500;
const ID_CHUNK_SIZE = 100;

/** Reads past Supabase's per-request row limit without returning a partial report. */
export async function fetchReportRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/** Keeps IN filters small and also paginates rows inside each ID chunk. */
export async function fetchReportRowsForIds<T, Id>(
  ids: Id[],
  fetchPage: (chunk: Id[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let start = 0; start < ids.length; start += ID_CHUNK_SIZE) {
    const chunk = ids.slice(start, start + ID_CHUNK_SIZE);
    rows.push(...await fetchReportRows((from, to) => fetchPage(chunk, from, to)));
  }

  return rows;
}
