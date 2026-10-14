// Replaces the header's old static breadcrumb with a quick-nav search —
// "where do I go" is a more useful thing to put there than "where am I"
// (the page title right below already says that). Pages only ever list what
// getAccessibleNavItems() says this signed-in account can actually reach —
// same adminOnly/superAdminOnly/permission gating the sidebar itself uses
// (see @/components/app-sidebar). Employees are searchable here too, but
// only when the account holds employees.view — same gate the Employee
// Directory page itself enforces — so this never becomes a way to discover
// a page or a person a role isn't supposed to see.
//
// The query is debounced before it's actually used to filter (the input
// itself updates instantly, so typing never feels laggy) — with a growing
// employee list, re-scoring every item on every keystroke is wasted work
// most of it immediately superseded by the next one. The same LoadingPulse
// animation used for Bulk Fix's scans and Database Backups (see
// @/components/loading-pulse) fills that debounce gap instead of the list
// snapping to new results with no transition.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { Search, User, Users } from "lucide-react";

import { getAccessibleNavItems, type NavItem } from "@/components/app-sidebar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { LoadingPulse } from "@/components/loading-pulse";
import { useEmployees } from "@/data/employee-store";
import { canViewEmployees } from "@/lib/permissions";
import { useCurrentAccount } from "@/lib/session";
import { cn } from "@/lib/utils";

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// How long to wait after the last keystroke before actually re-filtering —
// long enough to skip re-scoring on every character of a fast typist, short
// enough that it never reads as unresponsive.
const DEBOUNCE_MS = 250;

export function HeaderSearch() {
  const { data: account } = useCurrentAccount();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // Profile isn't in the sidebar (it's reachable from the account menu
  // instead — see @/components/app-shell), but it's a real page every
  // signed-in account can open, so it belongs in "search for a page" too.
  const items = useMemo<NavItem[]>(
    () => [...getAccessibleNavItems(account), { title: "Profile", url: "/profile", icon: User }],
    [account],
  );

  const canSeeEmployees = canViewEmployees(account?.permissions);
  const employees = useEmployees();
  const employeeResults = useMemo(
    () => (canSeeEmployees ? employees : []),
    [canSeeEmployees, employees],
  );

  useEffect(() => {
    if (query === debouncedQuery) return;
    // Clearing the box back to empty needs no debounce — the unfiltered
    // list is already known, so show it immediately instead of a fake
    // loading beat for "nothing to filter."
    if (!query.trim()) {
      setDebouncedQuery(query);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timeout = setTimeout(() => {
      setDebouncedQuery(query);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, debouncedQuery]);

  const filteredItems = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.title.toLowerCase().includes(q));
  }, [items, debouncedQuery]);

  const filteredEmployees = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return employeeResults;
    return employeeResults.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.office.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q),
    );
  }, [employeeResults, debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function go(url: NavItem["url"]) {
    navigate({ to: url });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function goToEmployee(employeeId: string) {
    navigate({ to: "/directory/$employeeId", params: { employeeId } });
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  return (
    <div
      ref={containerRef}
      className="relative min-w-0 flex-1 sm:max-w-sm"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setOpen(false);
          inputRef.current?.blur();
        }
      }}
    >
      <Command
        shouldFilter={false}
        className="h-auto w-full overflow-visible rounded-none bg-transparent"
      >
        <div
          className={cn(
            "flex h-9 items-center gap-2 rounded-full border bg-muted/40 px-3 transition-colors",
            open ? "border-primary/40 bg-background ring-2 ring-primary/15" : "hover:bg-muted/60",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <CommandPrimitive.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            onFocus={() => setOpen(true)}
            placeholder={canSeeEmployees ? "Search pages or employees..." : "Search pages..."}
            aria-label={canSeeEmployees ? "Search pages or employees" : "Search pages"}
            className="h-full min-w-0 w-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {!open && !query && (
            <kbd className="hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-block">
              {IS_MAC ? "⌘K" : "Ctrl K"}
            </kbd>
          )}
        </div>

        {open && (
          <CommandList
            onMouseDown={(e) => e.preventDefault()}
            className="fixed inset-x-4 top-14 z-50 mt-2 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:w-full"
          >
            {searching ? (
              <LoadingPulse icon={Search} title="Searching..." />
            ) : (
              <>
                <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
                  Nothing matches &quot;{debouncedQuery}&quot;.
                </CommandEmpty>
                <CommandGroup heading="Pages">
                  {filteredItems.map((item) => (
                    <CommandItem key={item.url} value={item.title} onSelect={() => go(item.url)}>
                      <item.icon className="h-4 w-4 text-muted-foreground" />
                      {item.title}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {filteredEmployees.length > 0 && (
                  <CommandGroup heading="Employees">
                    {filteredEmployees.map((employee) => (
                      <CommandItem
                        key={employee.id}
                        value={employee.name}
                        onSelect={() => goToEmployee(employee.id)}
                      >
                        <Users className="h-4 w-4 text-muted-foreground" />
                        {employee.name}
                        <span className="ml-auto truncate text-xs text-muted-foreground">
                          {employee.position || employee.office}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        )}
      </Command>
    </div>
  );
}
