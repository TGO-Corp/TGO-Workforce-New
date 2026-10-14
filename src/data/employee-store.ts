import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Employee } from "@/data/employees";
import {
  bulkDeleteEmployees,
  createEmployee,
  deleteEmployee,
  fetchEmployees,
  importEmployees,
  updateEmployee,
  type ImportRowInput,
  type NewEmployeeInput,
} from "@/data/employee-api";

// The Employee Directory, Manage Employees dialog, New Hire form and Excel
// Import all read and write through these hooks — a React Query cache keyed
// on "employees", backed by the FastAPI/Postgres API (see
// backend/app/api/routes/employees.py). A mutation invalidates that cache on
// success, so every consumer re-renders with the fresh list — same "an edit
// in one place shows up everywhere else immediately" behavior the old
// localStorage-backed store had, just backed by a real database now instead
// of per-browser storage.

const EMPLOYEES_KEY = ["employees"] as const;

// Polling interval for "realtime" data: the app has multiple people signed
// in at once now (Zoho SSO), so one person's create/edit/delete should show
// up for everyone else without them having to reload. This isn't push-based
// (no websocket) — it's a background refetch every 15s, plus React Query's
// default refetch-on-window-focus, which is enough for HR data that changes
// on the order of minutes, not milliseconds.
const REALTIME_POLL_MS = 15_000;

export function useEmployeesQuery(enabled = true) {
  return useQuery({
    queryKey: EMPLOYEES_KEY,
    queryFn: fetchEmployees,
    enabled,
    refetchInterval: enabled ? REALTIME_POLL_MS : false,
  });
}

/** Convenience for read-only consumers that just want the list — empty while
 * loading or on error, the same shape the old synchronous store returned.
 * Use useEmployeesQuery() directly where a loading/error state matters. */
export function useEmployees(): Employee[] {
  const { data } = useEmployeesQuery();
  return data ?? [];
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewEmployeeInput) => createEmployee(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** `originalId` is the id the record had when editing started (the PATCH
 * URL); `employee.id` is the form's current value, which may have been
 * edited — see the doc comment on employee-api.ts's updateEmployee(). */
export function useUpdateEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ originalId, employee }: { originalId: string; employee: Employee }) =>
      updateEmployee(originalId, employee),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

/** Checkbox multi-select delete from the Employee Directory table. */
export function useBulkDeleteEmployees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteEmployees(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}

export function useImportEmployees() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: ImportRowInput[]) => importEmployees(rows),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  });
}
