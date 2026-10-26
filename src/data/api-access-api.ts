// HTTP client for the /api-access endpoints (backend/app/api/routes/api_access.py)
// - the Super Admin-only API Access module: keys for other internal apps to
// read employee data, and the log of what they did with them.

import { apiUrl } from "@/lib/api";

export type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdByLabel: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

/** Returned once, on creation - the only time the full key is available. */
export type CreatedApiKey = ApiKey & { key: string };

export type ApiRequest = {
  id: number;
  keyName: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  clientIp: string | null;
  createdAt: string;
};

export type ApiRequestPage = { items: ApiRequest[]; total: number };

export type ApiStats = {
  hours: number;
  requests: number;
  errors: number;
  successRate: number | null;
  avgMs: number | null;
  p95Ms: number | null;
  activeKeys: number;
  totalKeys: number;
  bucket: "hour" | "day";
  series: { bucket: string; total: number; errors: number }[];
  endpoints: { label: string; count: number }[];
  statuses: { label: string; count: number }[];
};

export type ApiKeyInput = { name: string; scopes: string[]; expiresInDays: number | null };

type BackendKey = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by_label: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

function keyFromBackend(row: BackendKey): ApiKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    createdByLabel: row.created_by_label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

type BackendRequest = {
  id: number;
  key_name: string | null;
  method: string;
  path: string;
  status_code: number;
  duration_ms: number;
  client_ip: string | null;
  created_at: string;
};

type BackendStats = {
  hours: number;
  requests: number;
  errors: number;
  success_rate: number | null;
  avg_ms: number | null;
  p95_ms: number | null;
  active_keys: number;
  total_keys: number;
  bucket: "hour" | "day";
  series: { bucket: string; total: number; errors: number }[];
  endpoints: { label: string; count: number }[];
  statuses: { label: string; count: number }[];
};

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

export async function fetchApiScopes(): Promise<string[]> {
  return request<string[]>("/api-access/scopes");
}

export async function fetchApiKeys(): Promise<ApiKey[]> {
  const rows = await request<BackendKey[]>("/api-access/keys");
  return rows.map(keyFromBackend);
}

export async function createApiKey(input: ApiKeyInput): Promise<CreatedApiKey> {
  const row = await request<BackendKey & { key: string }>("/api-access/keys", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      scopes: input.scopes,
      expires_in_days: input.expiresInDays,
    }),
  });
  return { ...keyFromBackend(row), key: row.key };
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const row = await request<BackendKey>(`/api-access/keys/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
  return keyFromBackend(row);
}

export async function deleteApiKey(id: string): Promise<void> {
  await request<void>(`/api-access/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchApiStats(hours: number): Promise<ApiStats> {
  const row = await request<BackendStats>(`/api-access/stats?hours=${hours}`);
  return {
    hours: row.hours,
    requests: row.requests,
    errors: row.errors,
    successRate: row.success_rate,
    avgMs: row.avg_ms,
    p95Ms: row.p95_ms,
    activeKeys: row.active_keys,
    totalKeys: row.total_keys,
    bucket: row.bucket,
    series: row.series,
    endpoints: row.endpoints,
    statuses: row.statuses,
  };
}

export async function fetchApiRequests(params: {
  keyId?: string | undefined;
  outcome?: "ok" | "error" | undefined;
  limit: number;
  offset: number;
}): Promise<ApiRequestPage> {
  const query = new URLSearchParams({
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.keyId) query.set("key_id", params.keyId);
  if (params.outcome) query.set("outcome", params.outcome);
  const page = await request<{ items: BackendRequest[]; total: number }>(
    `/api-access/requests?${query}`,
  );
  return {
    total: page.total,
    items: page.items.map((row) => ({
      id: row.id,
      keyName: row.key_name,
      method: row.method,
      path: row.path,
      statusCode: row.status_code,
      durationMs: row.duration_ms,
      clientIp: row.client_ip,
      createdAt: row.created_at,
    })),
  };
}
