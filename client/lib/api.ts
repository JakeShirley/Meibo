// Typed API client — replaces PocketBase SDK
// All data access goes through the new REST API on the Express server.

const AUTH_TOKEN_STORAGE_KEY = "contact-book-auth-token";
export const AUTH_REQUIRED_EVENT = "contact-book-auth-required";

export interface AuthState {
  authEnabled: boolean;
  authenticated: boolean;
}

export class AuthRequiredError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

type AuthMode = "unknown" | "disabled" | "enabled";

function readStoredToken(): string | null {
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

let authToken: string | null = null;
let authMode: AuthMode = "unknown";
let authPromise: Promise<AuthState> | null = null;

authToken = readStoredToken();
if (authToken) authMode = "enabled";

function storeToken(token: string | null) {
  authToken = token;
  try {
    if (token) window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    else window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function emitAuthRequired() {
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

async function readJSONBody(res: Response): Promise<Record<string, unknown>> {
  return await res.json().catch(() => ({})) as Record<string, unknown>;
}

function stateFromBody(data: Record<string, unknown>): AuthState {
  return {
    authEnabled: data.authEnabled === true,
    authenticated: data.authenticated !== false,
  };
}

function authHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  if (authToken) next.set("Authorization", `Bearer ${authToken}`);
  return next;
}

async function doAuthCheck(): Promise<AuthState> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: authHeaders(),
  });
  const data = await readJSONBody(res);

  if (res.ok) {
    const state = stateFromBody(data);
    authMode = state.authEnabled ? "enabled" : "disabled";
    if (!state.authEnabled) storeToken(null);
    return state;
  }

  if (res.status === 401) {
    storeToken(null);
    authMode = "enabled";
    return { authEnabled: true, authenticated: false };
  }

  throw new Error(typeof data.error === "string" ? data.error : `Auth check failed (${res.status})`);
}

export function checkAuthentication(): Promise<AuthState> {
  if (!authPromise) {
    authPromise = doAuthCheck().finally(() => { authPromise = null; });
  }
  return authPromise;
}

export async function login(username: string, password: string): Promise<AuthState> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await readJSONBody(res);

  if (!res.ok) {
    if (res.status === 401) authMode = "enabled";
    throw new Error(typeof data.error === "string" ? data.error : `Login failed (${res.status})`);
  }

  const state = stateFromBody(data);
  authMode = state.authEnabled ? "enabled" : "disabled";

  if (state.authEnabled && typeof data.token === "string" && data.token) {
    storeToken(data.token);
  } else {
    storeToken(null);
  }

  return state;
}

export async function ensureAuthenticated(): Promise<void> {
  if (authMode === "disabled" || authToken) return;
  if (authMode === "enabled") throw new AuthRequiredError();

  const state = await checkAuthentication();
  if (state.authEnabled && !state.authenticated) throw new AuthRequiredError();
}

export function getToken(): string {
  return authToken ?? "";
}

async function apiFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  await ensureAuthenticated();
  const res = await fetch(url, {
    ...opts,
    headers: authHeaders(opts.headers),
  });

  if (res.status === 401) {
    storeToken(null);
    authMode = "enabled";
    emitAuthRequired();
  }

  return res;
}

async function apiJSON<T = unknown>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await apiFetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as Record<string, string>).error || `Request failed (${res.status})`) as Error & { status: number; data: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;

  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (encoded) return decodeURIComponent(encoded.replace(/"/g, ""));

  const quoted = /filename="([^"]+)"/i.exec(disposition)?.[1];
  if (quoted) return quoted;

  return /filename=([^;]+)/i.exec(disposition)?.[1]?.trim() ?? null;
}

function fallbackFilename(url: string): string {
  const pathname = new URL(url, window.location.href).pathname;
  return pathname.split("/").filter(Boolean).pop() || "download";
}

export async function downloadApiFile(url: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) {
    const data = await readJSONBody(res);
    throw new Error(typeof data.error === "string" ? data.error : `Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filenameFromDisposition(res.headers.get("Content-Disposition")) ?? fallbackFilename(url);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
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
    secondary: string;
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
    filter?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.perPage) qs.set("perPage", String(params.perPage));
    if (params.sort) qs.set("sort", params.sort);
    if (params.search) qs.set("search", params.search);
    if (params.linked) qs.set("linked", params.linked);
    if (params.filter) qs.set("filter", params.filter);
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

  uploadPhoto: (id: string, photo: string, mime: string) =>
    apiJSON<{ photoUri: string }>(`/api/contacts/${id}/photo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photo, mime }),
    }),

  deletePhoto: (id: string) =>
    apiJSON<{ ok: boolean }>(`/api/contacts/${id}/photo`, { method: "DELETE" }),
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

  deleteContact: (href: string) =>
    apiJSON<{ ok: boolean }>("/api/carddav/contacts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ href }),
    }),
};

// ── Geocode ─────────────────────────────────────────────────────────

export const geocode = {
  forward: (q: string) =>
    apiJSON<{ lat: number; lon: number; display_name: string }>(`/api/geocode?q=${encodeURIComponent(q)}`),
};
