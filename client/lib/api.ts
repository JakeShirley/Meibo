// Typed API client — replaces PocketBase SDK
// All data access goes through the new REST API on the Express server.

let authToken: string | null = null;
let authPromise: Promise<void> | null = null;

async function doAuth(): Promise<void> {
  if (authToken) return;
  const res = await fetch("/api/auth/login", { method: "POST" });
  const data = await res.json();
  if (data.token) {
    authToken = data.token;
  } else {
    console.error("[Auth] Server auth failed:", data.error);
  }
}

export function ensureAuthenticated(): Promise<void> {
  if (authToken) return Promise.resolve();
  if (!authPromise) {
    authPromise = doAuth().finally(() => { authPromise = null; });
  }
  return authPromise;
}

export function getToken(): string {
  return authToken ?? "";
}

async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  await ensureAuthenticated();
  return fetch(url, opts);
}

async function apiJSON<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, opts);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error((data as Record<string, string>).error || `Request failed (${res.status})`) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

// ── Types ───────────────────────────────────────────────────────────

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  options?: {
    collectionId?: string;
    collectionName?: string;
    maxSelect?: number;
    items?: { id: string; label: string }[];
    [key: string]: unknown;
  };
}

export interface SchemaResponse {
  fields: SchemaField[];
}

export interface PaginatedResult<T = Record<string, unknown>> {
  items: T[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export interface Contact {
  id: string;
  _linked?: boolean;
  _photoUri?: string | null;
  _carddavHref?: string | null;
  [key: string]: unknown;
}

export interface MapPinResident {
  id: string;
  name: string;
}

export interface MapPin {
  lat: number;
  lon: number;
  address: string;
  addressId: string;
  residents: MapPinResident[];
}

export interface CardDavContact {
  uid: string;
  href: string;
  etag: string;
  fn: string;
  email: string;
  tel: string;
  org: string;
  photoUri: string;
  adrStreet: string;
  adrCity: string;
  adrState: string;
  adrZip: string;
  adrCountry: string;
  bdayYear: number;
  bdayMonth: number;
  bdayDay: number;
  raw: string;
}

export interface AddressBook {
  href: string;
  displayName: string;
}

export interface GeocodeSuggestion {
  confidence: string;
  match_code?: Record<string, string>;
  suggested_address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    full: string;
  };
}

export type MergeFieldSelections = {
  first_name: "pb" | "carddav";
  last_name: "pb" | "carddav";
  email: "pb" | "carddav";
  phone_number: "pb" | "carddav";
  address: "pb" | "carddav";
  birthday: "pb" | "carddav";
};

// ── Schema ──────────────────────────────────────────────────────────

export const schema = {
  contacts: () => apiJSON<SchemaResponse>("/api/schema/contacts"),
  addresses: () => apiJSON<SchemaResponse>("/api/schema/addresses"),
  tags: () => apiJSON<SchemaResponse>("/api/schema/tags"),
};

// ── Contacts ────────────────────────────────────────────────────────

export const contacts = {
  list: (params: {
    page?: number;
    perPage?: number;
    sort?: string;
    search?: string;
    linked?: "all" | "linked" | "unlinked";
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.perPage) qs.set("perPage", String(params.perPage));
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    if (params.linked) qs.set("linked", params.linked);
    return apiJSON<PaginatedResult<Contact>>(`/api/contacts?${qs}`);
  },

  get: (id: string) => apiJSON<Contact>(`/api/contacts/${id}`),

  create: (data: Record<string, unknown>) =>
    apiJSON<Contact>("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiJSON<Contact>(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiJSON<{ ok: boolean }>(`/api/contacts/${id}`, { method: "DELETE" }),

  bulkUpdate: (ids: string[], data: Record<string, unknown>, mode: "set" | "add" | "remove" = "set") =>
    apiJSON<{ updated: number; errors: string[] }>("/api/contacts/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, data, mode }),
    }),

  map: () => apiJSON<MapPin[]>("/api/contacts/map"),

  exportUrl: (format: "csv" | "json", params: { sort?: string; search?: string } = {}) => {
    const qs = new URLSearchParams({ format });
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    return `/api/contacts/export?${qs}`;
  },

  // Linking
  link: (id: string, carddavHref: string) =>
    apiJSON<{ ok: boolean }>(`/api/contacts/${id}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carddavHref }),
    }),

  linkCreate: (id: string, book: string) =>
    apiJSON<{ href: string }>(`/api/contacts/${id}/link/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ book }),
    }),

  unlink: (id: string) =>
    apiJSON<{ ok: boolean }>(`/api/contacts/${id}/link`, { method: "DELETE" }),

  merge: (id: string, carddavHref: string, fieldSelections: MergeFieldSelections) =>
    apiJSON<{ ok: boolean }>(`/api/contacts/${id}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carddavHref, fieldSelections }),
    }),
};

// ── Addresses ───────────────────────────────────────────────────────

export const addresses = {
  list: (params: {
    page?: number;
    perPage?: number;
    sort?: string;
    search?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.perPage) qs.set("perPage", String(params.perPage));
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    return apiJSON<PaginatedResult>(`/api/addresses?${qs}`);
  },

  get: (id: string) => apiJSON<Record<string, unknown>>(`/api/addresses/${id}`),

  create: (data: Record<string, unknown>) =>
    apiJSON<Record<string, unknown> & { _geocode?: GeocodeSuggestion }>("/api/addresses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiJSON<Record<string, unknown> & { _geocode?: GeocodeSuggestion }>(`/api/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiJSON<{ ok: boolean }>(`/api/addresses/${id}`, { method: "DELETE" }),

  rehydrateOne: (id: string) =>
    apiJSON<Record<string, unknown> & { _geo?: { lat: number; lon: number } }>(`/api/addresses/${id}/rehydrate`, {
      method: "POST",
    }),

  exportUrl: (format: "csv" | "json", params: { sort?: string; search?: string } = {}) => {
    const qs = new URLSearchParams({ format });
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    return `/api/addresses/export?${qs}`;
  },
};

// ── Tags ────────────────────────────────────────────────────────────

export const tags = {
  list: (params: {
    page?: number;
    perPage?: number;
    sort?: string;
    search?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.perPage) qs.set("perPage", String(params.perPage));
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    return apiJSON<PaginatedResult>(`/api/tags?${qs}`);
  },

  create: (data: Record<string, unknown>) =>
    apiJSON<Record<string, unknown>>("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiJSON<Record<string, unknown>>(`/api/tags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiJSON<{ ok: boolean }>(`/api/tags/${id}`, { method: "DELETE" }),

  exportUrl: (format: "csv" | "json", params: { sort?: string } = {}) => {
    const qs = new URLSearchParams({ format });
    if (params.sort) qs.set("sort", params.sort);
    return `/api/tags/export?${qs}`;
  },
};

// ── CardDAV ─────────────────────────────────────────────────────────

export const carddav = {
  addressBooks: () => apiJSON<AddressBook[]>("/api/carddav/address-books"),

  contacts: (bookHref: string) =>
    apiJSON<CardDavContact[]>(`/api/carddav/contacts?book=${encodeURIComponent(bookHref)}`),

  links: () => apiJSON<Record<string, string>>("/api/carddav/links"),
};

// ── Geocode ─────────────────────────────────────────────────────────

export const geocode = {
  forward: (q: string) =>
    apiJSON<{ lat: number; lon: number; display_name: string }>(`/api/geocode?q=${encodeURIComponent(q)}`),
};
