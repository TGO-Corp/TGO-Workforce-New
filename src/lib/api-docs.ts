// What the API Access module tells integrators: the endpoint reference shown on
// the Documentation tab and written into the downloadable guide. One source, so
// the two never drift apart. Mirrors backend/app/api/routes/public_api.py.

import { API_URL } from "@/lib/api";

export type ApiEndpointDoc = {
  method: "GET";
  path: string;
  scope: string;
  summary: string;
  params: { name: string; description: string }[];
};

export const API_ENDPOINTS: ApiEndpointDoc[] = [
  {
    method: "GET",
    path: "/employees",
    scope: "employees",
    summary: "List employees, ordered by ID.",
    params: [
      { name: "q", description: "Match on name or employee ID." },
      { name: "office", description: "Exact office, e.g. PH Eastwood." },
      { name: "department", description: "Exact department." },
      { name: "status", description: "Active, Resigned or Terminated." },
      { name: "limit", description: "1 to 500 (default 100)." },
      { name: "offset", description: "Rows to skip, for paging (default 0)." },
    ],
  },
  {
    method: "GET",
    path: "/employees/{id}",
    scope: "employees",
    summary: "One employee by ID, e.g. TGO-1001.",
    params: [],
  },
  {
    method: "GET",
    path: "/awards",
    scope: "awards",
    summary: "List recognition awards, newest first.",
    params: [
      { name: "employee_id", description: "Only this employee's awards." },
      { name: "limit", description: "1 to 500 (default 100)." },
      { name: "offset", description: "Rows to skip, for paging (default 0)." },
    ],
  },
];

export const STATUS_MEANINGS: { code: string; meaning: string }[] = [
  { code: "200", meaning: "Success." },
  { code: "401", meaning: "The key is missing, wrong, revoked or expired." },
  { code: "403", meaning: "The key is valid but does not have access to that dataset." },
  { code: "404", meaning: "That record does not exist." },
  { code: "422", meaning: "A query parameter was invalid (for example limit above 500)." },
];

/** The address integrators should call: the backend's own origin, not this site's
 * /backend proxy path when the app is reached through it. */
export function publicApiBase(): string {
  const base = API_URL.startsWith("http")
    ? API_URL
    : `${typeof window !== "undefined" ? window.location.origin : ""}${API_URL}`;
  return `${base.replace(/\/$/, "")}/public/v1`;
}

export function curlExample(base: string, key = "YOUR_API_KEY"): string {
  return `curl "${base}/employees?status=Active&limit=50" \\\n  -H "Authorization: Bearer ${key}"`;
}

export function fetchExample(base: string, key = "YOUR_API_KEY"): string {
  return [
    `const res = await fetch("${base}/employees?status=Active&limit=50", {`,
    `  headers: { Authorization: "Bearer ${key}" },`,
    `});`,
    `const employees = await res.json();`,
  ].join("\n");
}

export const SAMPLE_EMPLOYEE = `{
  "id": "TGO-1001",
  "name": "Juan Dela Cruz",
  "office": "PH Eastwood",
  "department": "Operations",
  "position": "Team Lead",
  "level": "L3",
  "start_date": "2023-02-01",
  "status": "Active",
  "exit_date": null,
  "birthday": "1994-06-12"
}`;
