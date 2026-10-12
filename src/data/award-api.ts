// HTTP client for the /awards endpoints (backend/app/api/routes/awards.py) —
// Recognition & Awards, under the Milestones nav group.

import { apiUrl } from "@/lib/api";
import { fetchAllPages } from "@/lib/paged-fetch";

export type Award = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeOffice: string;
  title: string;
  description: string | null;
  awardedDate: string; // ISO date
  awardedByLabel: string;
  createdAt: string;
  updatedAt: string;
};

type BackendAward = {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_office: string;
  title: string;
  description: string | null;
  awarded_date: string;
  awarded_by_label: string;
  created_at: string;
  updated_at: string;
};

function fromBackend(row: BackendAward): Award {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeOffice: row.employee_office,
    title: row.title,
    description: row.description,
    awardedDate: row.awarded_date,
    awardedByLabel: row.awarded_by_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, path));
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Same error-unwrapping as the other data modules — surfaces FastAPI's
 * `{"detail": "..."}` (or a Pydantic 422 array) as a plain string instead of
 * a raw JSON blob in a toast. */
async function readErrorMessage(response: Response, path: string): Promise<string> {
  const fallback = `Request to ${path} failed (${response.status})`;
  const body = await response.text();
  if (!body) return fallback;
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === "string") return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const messages = parsed.detail
        .map((item) =>
          item && typeof item === "object" && "msg" in item ? String(item.msg) : null,
        )
        .filter((msg): msg is string => Boolean(msg));
      if (messages.length > 0) return messages.join("; ");
    }
    return fallback;
  } catch {
    return body;
  }
}

export async function fetchAwards(employeeId?: string): Promise<Award[]> {
  // Every page — the server's default page is only 200 awards.
  const rows = await fetchAllPages((limit, offset) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (employeeId) params.set("employee_id", employeeId);
    return request<BackendAward[]>(`/awards?${params.toString()}`);
  });
  return rows.map(fromBackend);
}

export type AwardInput = {
  employeeId: string;
  title: string;
  description?: string;
  awardedDate: string;
};

export async function createAward(input: AwardInput): Promise<Award> {
  const row = await request<BackendAward>("/awards", {
    method: "POST",
    body: JSON.stringify({
      employee_id: input.employeeId,
      title: input.title,
      description: input.description || null,
      awarded_date: input.awardedDate,
    }),
  });
  return fromBackend(row);
}

export type AwardPatch = Partial<Pick<AwardInput, "title" | "description" | "awardedDate">>;

export async function updateAward(id: string, patch: AwardPatch): Promise<Award> {
  const row = await request<BackendAward>(`/awards/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description || null } : {}),
      ...(patch.awardedDate !== undefined ? { awarded_date: patch.awardedDate } : {}),
    }),
  });
  return fromBackend(row);
}

export async function deleteAward(id: string): Promise<void> {
  await request<void>(`/awards/${encodeURIComponent(id)}`, { method: "DELETE" });
}
