// The search + filter bar and the pager that sit above / below a table, driven
// by useListControls (@/lib/use-list-controls). Used by every HMO Management tab.

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_FILTER, PAGE_SIZES, type ListControls } from "@/lib/use-list-controls";

/** Search box, one dropdown per filter, a Clear button once anything is active,
 * and a live "x of y" count. `children` (e.g. an Export menu) sits at the end. */
export function ListToolbar<T>({
  controls,
  searchPlaceholder,
  noun,
  children,
}: {
  controls: ListControls<T>;
  searchPlaceholder: string;
  /** Plural noun for the count, e.g. "members". */
  noun: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={controls.search}
          onChange={(e) => controls.setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="w-[240px] pl-8"
        />
      </div>

      {controls.filterDefs.map((def) => (
        <Select
          key={def.key}
          value={controls.filterValues[def.key] ?? ALL_FILTER}
          onValueChange={(value) => controls.setFilter(def.key, value)}
        >
          <SelectTrigger className="w-auto min-w-[150px]" aria-label={`Filter by ${def.label}`}>
            <SelectValue placeholder={`All ${def.label}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER}>All {def.label}</SelectItem>
            {def.options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {controls.hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={controls.clear}>
          <X className="mr-1.5 h-3.5 w-3.5" /> Clear
        </Button>
      )}

      <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
        {controls.hasActiveFilters
          ? `${controls.filtered.length} of ${controls.total} ${noun}`
          : `${controls.total} ${noun}`}
      </span>
      {children}
    </div>
  );
}

/** Compact list of page numbers around the current one: 1 … 4 5 6 … 12. */
function pageNumbers(current: number, last: number): (number | "gap")[] {
  const wanted = new Set([1, last, current - 1, current, current + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    const previous = pages[i - 1];
    if (previous !== undefined && p - previous > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** "Showing 11–20 of 57", a rows-per-page picker and page buttons. Renders
 * nothing when there's nothing to page through. */
export function TablePager<T>({ controls, noun }: { controls: ListControls<T>; noun: string }) {
  if (controls.filtered.length === 0) return null;
  const { page, totalPages } = controls;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      <p className="text-muted-foreground">
        Showing <span className="font-medium text-foreground">{controls.from}</span>–
        <span className="font-medium text-foreground">{controls.to}</span> of{" "}
        <span className="font-medium text-foreground">{controls.filtered.length}</span> {noun}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Rows</span>
          <Select
            value={String(controls.pageSize)}
            onValueChange={(value) => controls.setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <nav className="flex items-center gap-1" aria-label="Pagination">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => controls.setPage(1)}
              disabled={page === 1}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => controls.setPage(page - 1)}
              disabled={page === 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageNumbers(page, totalPages).map((entry, i) =>
              entry === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={entry}
                  variant={entry === page ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => controls.setPage(entry)}
                  aria-label={`Page ${entry}`}
                  aria-current={entry === page ? "page" : undefined}
                >
                  {entry}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => controls.setPage(page + 1)}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => controls.setPage(totalPages)}
              disabled={page === totalPages}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}
