// Loads a whole list from an endpoint that serves it a page at a time, by
// asking for page after page until one comes back short. Used for the lists the
// rest of the app needs IN FULL (employees feed the Dashboard, Analytics, header
// search and every employee picker; awards feed the Awards page and Dashboard)
// — a single request with a fixed `limit` would silently cut the list off once
// it outgrew that limit. At today's sizes it is still exactly one request.
//
// Pages are fetched one after another (not in parallel) so a row can't be
// missed or doubled if the list changes mid-load; the server orders by a stable
// key (see the list routes) so offsets stay consistent.

export const PAGE_FETCH_SIZE = 500;
// Safety stop: 200 pages x 500 = 100,000 rows. Far beyond any real list here; it
// only exists so a misbehaving server can never loop this forever.
const MAX_PAGES = 200;

export async function fetchAllPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<T[]>,
  pageSize: number = PAGE_FETCH_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(pageSize, page * pageSize);
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
