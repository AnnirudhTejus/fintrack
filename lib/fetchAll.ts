// Supabase returns at most 1,000 rows per request. This keeps asking for the
// next 1,000 until everything is in, so totals and balances never silently
// miss older entries.
//
// The query must have a stable order (end with a unique column such as id),
// otherwise rows can shift between pages.

import type { PostgrestError } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

type RangeableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>
}

export async function fetchAllRows<T>(
  buildQuery: () => RangeableQuery<T>,
  pageSize = PAGE_SIZE
): Promise<{ data: T[]; error: PostgrestError | null }> {
  const rows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) return { data: rows, error }

    const batch = data || []
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return { data: rows, error: null }
}
