import { config } from "../config.js";

let cachedToken: string | null = null;
let tokenExpiry = 0;

/** Authenticate as PB admin and cache the token. */
async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const { pocketbaseUrl, adminEmail, adminPassword } = config;
  if (!adminEmail || !adminPassword) throw new Error("Admin credentials not configured");

  let res = await fetch(`${pocketbaseUrl}/api/admins/auth-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
  });
  if (res.status === 404) {
    res = await fetch(`${pocketbaseUrl}/api/collections/_superusers/records/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
    });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as Record<string, string>).message || `Auth failed (${res.status})`);
  }
  const data = await res.json();
  cachedToken = data.token;
  // Refresh 5 min before expiry (PB tokens last ~1h)
  tokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken!;
}

function authHeaders(): Promise<Record<string, string>> {
  return getToken().then((t) => ({
    "Content-Type": "application/json",
    Authorization: t,
  }));
}

function url(path: string): string {
  return `${config.pocketbaseUrl}${path}`;
}

export interface PBListResult<T = Record<string, unknown>> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface PBSchemaField {
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
}

export interface PBCollection {
  id: string;
  name: string;
  schema: PBSchemaField[];
}

// ── Generic helpers ────────────────────────────────────────────────

export async function pbGetCollection(nameOrId: string): Promise<PBCollection> {
  const headers = await authHeaders();
  const res = await fetch(url(`/api/collections/${nameOrId}`), { headers });
  if (!res.ok) throw new Error(`Failed to fetch collection ${nameOrId}: ${res.status}`);
  return res.json();
}

export async function pbList(
  collection: string,
  opts: { page?: number; perPage?: number; sort?: string; filter?: string; expand?: string } = {},
): Promise<PBListResult> {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (opts.page) params.set("page", String(opts.page));
  if (opts.perPage) params.set("perPage", String(opts.perPage));
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.filter) params.set("filter", opts.filter);
  if (opts.expand) params.set("expand", opts.expand);
  const qs = params.toString();
  const res = await fetch(url(`/api/collections/${collection}/records${qs ? `?${qs}` : ""}`), { headers });
  if (!res.ok) throw new Error(`PB list ${collection} failed: ${res.status}`);
  return res.json();
}

export async function pbGetFullList(
  collection: string,
  opts: { sort?: string; filter?: string; expand?: string } = {},
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let page = 1;
  while (true) {
    const result = await pbList(collection, { ...opts, page, perPage: 200 });
    all.push(...result.items);
    if (page >= result.totalPages) break;
    page++;
  }
  return all;
}

export async function pbGetOne(collection: string, id: string, expand?: string): Promise<Record<string, unknown>> {
  const headers = await authHeaders();
  const qs = expand ? `?expand=${encodeURIComponent(expand)}` : "";
  const res = await fetch(url(`/api/collections/${collection}/records/${id}${qs}`), { headers });
  if (!res.ok) throw new Error(`PB get ${collection}/${id} failed: ${res.status}`);
  return res.json();
}

export async function pbCreate(collection: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await authHeaders();
  const res = await fetch(url(`/api/collections/${collection}/records`), {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`PB create ${collection} failed: ${res.status}`) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body;
}

export async function pbUpdate(collection: string, id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await authHeaders();
  const res = await fetch(url(`/api/collections/${collection}/records/${id}`), {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) {
    const err = new Error(`PB update ${collection}/${id} failed: ${res.status}`) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body;
}

export async function pbDelete(collection: string, id: string): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(url(`/api/collections/${collection}/records/${id}`), {
    method: "DELETE",
    headers,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`PB delete ${collection}/${id} failed: ${res.status}`);
  }
}

export { getToken };
