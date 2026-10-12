// Search + dropdown filters + pagination for a list that's already fully loaded
// in the browser (every HMO table is — the API returns the whole set). One hook
// so each table doesn't hand-roll its own copy; pair it with <ListToolbar> and
// <TablePager> from @/components/list-toolbar.
//
//   const controls = useListControls(items, {
//     searchFields: (m) => [m.name, m.department],
//     filters: [{ key: "status", label: "statuses", options: STATUSES, get: (m) => m.status }],
//   });
//   controls.pageItems  -> the rows to render for the current page
//
// Changing the search, a filter or the page size always jumps back to page 1,
// and the page is clamped if the list shrinks (e.g. after a delete) so it can
// never point past the last page.

import { useState } from "react";

export const ALL_FILTER = "all";
export const PAGE_SIZES = [10, 25, 50] as const;

export type FilterDef<T> = {
  key: string;
  /** Plural noun used in the dropdown, e.g. "statuses" -> "All statuses". */
  label: string;
  options: readonly string[];
  get: (item: T) => string | null | undefined;
};

export type ListConfig<T> = {
  /** Every text the search box should match against for one row. */
  searchFields: (item: T) => (string | null | undefined)[];
  filters?: FilterDef<T>[];
  defaultPageSize?: number;
};

export type ListControls<T> = {
  search: string;
  setSearch: (value: string) => void;
  filterDefs: FilterDef<T>[];
  filterValues: Record<string, string>;
  setFilter: (key: string, value: string) => void;
  clear: () => void;
  hasActiveFilters: boolean;
  page: number;
  setPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  totalPages: number;
  /** Everything that passed the search + filters (all pages). */
  filtered: T[];
  /** Just the current page's rows. */
  pageItems: T[];
  /** Size of the unfiltered list. */
  total: number;
  /** 1-based index of the first / last row shown, 0 when empty. */
  from: number;
  to: number;
};

/** Sorted, de-duplicated, non-empty values — handy for building filter options
 * from the data itself (departments, relationships, ...). */
export function uniqueOptions(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim() !== ""))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function useListControls<T>(items: readonly T[], config: ListConfig<T>): ListControls<T> {
  const [search, setSearchState] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(config.defaultPageSize ?? PAGE_SIZES[0]);

  const filterDefs = config.filters ?? [];
  const query = search.trim().toLowerCase();

  // Plain computation each render (not memoised): the lists are a few hundred
  // rows at most, and config holds closures that may legitimately change.
  const filtered = items.filter((item) => {
    if (query && !config.searchFields(item).some((field) => field?.toLowerCase().includes(query))) {
      return false;
    }
    return filterDefs.every((def) => {
      const wanted = filterValues[def.key] ?? ALL_FILTER;
      return wanted === ALL_FILTER || (def.get(item) ?? "") === wanted;
    });
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const hasActiveFilters =
    query !== "" || filterDefs.some((def) => (filterValues[def.key] ?? ALL_FILTER) !== ALL_FILTER);

  return {
    search,
    setSearch: (value) => {
      setSearchState(value);
      setPageState(1);
    },
    filterDefs,
    filterValues,
    setFilter: (key, value) => {
      setFilterValues((current) => ({ ...current, [key]: value }));
      setPageState(1);
    },
    clear: () => {
      setSearchState("");
      setFilterValues({});
      setPageState(1);
    },
    hasActiveFilters,
    page: safePage,
    setPage: (next) => setPageState(Math.min(Math.max(1, next), totalPages)),
    pageSize,
    setPageSize: (size) => {
      setPageSizeState(size);
      setPageState(1);
    },
    totalPages,
    filtered,
    pageItems,
    total: items.length,
    from: filtered.length === 0 ? 0 : start + 1,
    to: start + pageItems.length,
  };
}
