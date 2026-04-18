import { config } from "../config.js";

/** Minimal vCard parsed contact */
export interface CardDavContact {
  uid: string;
  href: string;
  etag: string;
  fn: string;
  email: string;
  tel: string;
  org: string;
  raw: string; // full vCard text
}

/** Address book discovered from Radicale */
export interface AddressBook {
  href: string;
  displayName: string;
}

function authHeader(): string {
  const { radicaleUser, radicalePassword } = config;
  if (!radicaleUser) return "";
  return "Basic " + Buffer.from(`${radicaleUser}:${radicalePassword}`).toString("base64");
}

async function davRequest(path: string, method: string, body: string, depth = "1"): Promise<string> {
  const base = config.radicaleUrl.replace(/\/+$/, "");
  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/xml; charset=utf-8",
    Depth: depth,
  };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;

  console.log(`[CardDAV] ${method} ${url} (Depth: ${depth})`);
  console.log(`[CardDAV] Auth: ${auth ? "Basic ***" : "(none)"}`);
  console.log(`[CardDAV] Request body:\n${body}`);

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();

  console.log(`[CardDAV] Response: ${res.status} ${res.statusText}`);
  console.log(`[CardDAV] Response body (first 1000 chars):\n${text.slice(0, 1000)}`);

  if (!res.ok) {
    throw new Error(`CardDAV ${method} ${path} failed (${res.status}): ${text}`);
  }
  return text;
}

// ── Discover address books ──────────────────────────────────────────
export async function listAddressBooks(): Promise<AddressBook[]> {
  const user = config.radicaleUser || "";
  // PROPFIND on the user principal to discover address book collections
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
  </d:prop>
</d:propfind>`;

  console.log(`[CardDAV] Discovering address books for user: "${user}"`);
  const body = await davRequest(`/${user}/`, "PROPFIND", xml, "1");
  const books: AddressBook[] = [];

  // Simple XML extraction — handle both prefixed (d:response) and unprefixed (response)
  const responses = body.split(/<(?:[\w-]+:)?response[ >]/gi).slice(1);
  console.log(`[CardDAV] Found ${responses.length} response(s) in PROPFIND`);
  for (const r of responses) {
    // Only keep addressbook collections
    const isAddressBook = /<(?:[\w-]+:)?addressbook/i.test(r);
    const hrefMatch = r.match(/<(?:[\w-]+:)?href>([^<]+)<\//);
    console.log(`[CardDAV]   response href=${hrefMatch?.[1] ?? "(none)"} isAddressBook=${isAddressBook}`);
    if (!isAddressBook) continue;
    const nameMatch = r.match(/<(?:[\w-]+:)?displayname>([^<]*)<\//);
    if (hrefMatch) {
      books.push({
        href: hrefMatch[1],
        displayName: nameMatch?.[1] || hrefMatch[1],
      });
    }
  }
  console.log(`[CardDAV] Discovered ${books.length} address book(s):`, books);
  return books;
}

// ── Fetch all contacts in an address book ───────────────────────────
export async function listContacts(addressBookHref: string): Promise<CardDavContact[]> {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<card:addressbook-query xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <card:address-data/>
  </d:prop>
</card:addressbook-query>`;

  console.log(`[CardDAV] Fetching contacts from: ${addressBookHref}`);
  const body = await davRequest(addressBookHref, "REPORT", xml, "1");
  const contacts: CardDavContact[] = [];

  const responses = body.split(/<(?:[\w-]+:)?response[ >]/gi).slice(1);
  console.log(`[CardDAV] Found ${responses.length} contact response(s)`);
  for (const r of responses) {
    const hrefMatch = r.match(/<(?:[\w-]+:)?href>([^<]+)<\//);
    const etagMatch = r.match(/<(?:[\w-]+:)?getetag>"?([^"<]+)"?<\//);
    const vcardMatch = r.match(/<(?:[\w-]+:)?address-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?address-data>/i);
    if (!hrefMatch || !vcardMatch) continue;

    const raw = decodeXmlEntities(vcardMatch[1].trim());
    contacts.push({
      uid: extractVCardField(raw, "UID") || hrefMatch[1],
      href: hrefMatch[1],
      etag: etagMatch?.[1] || "",
      fn: extractVCardField(raw, "FN") || "",
      email: extractVCardField(raw, "EMAIL") || "",
      tel: extractVCardField(raw, "TEL") || "",
      org: extractVCardField(raw, "ORG") || "",
      raw,
    });
  }

  return contacts;
}

// ── Update a single vCard on Radicale via PUT ───────────────────────
export async function updateVCard(href: string, vcard: string, etag?: string): Promise<void> {
  const base = config.radicaleUrl.replace(/\/+$/, "");
  const url = `${base}${href.startsWith("/") ? "" : "/"}${href}`;
  const headers: Record<string, string> = {
    "Content-Type": "text/vcard; charset=utf-8",
  };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;
  if (etag) headers["If-Match"] = `"${etag.replace(/"/g, "")}"`;

  console.log(`[CardDAV] PUT ${url}`);
  const res = await fetch(url, { method: "PUT", headers, body: vcard });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CardDAV PUT ${href} failed (${res.status}): ${text}`);
  }
  console.log(`[CardDAV] PUT ${href} → ${res.status}`);
}

// ── Build a vCard string from field values ──────────────────────────
export interface VCardFields {
  uid?: string;
  fn?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  tel?: string;
  org?: string;
}

export function buildVCard(fields: VCardFields, existingRaw?: string): string {
  // If we have an existing vCard, update fields in-place to preserve extra data
  if (existingRaw) {
    let vcard = existingRaw;
    const setField = (name: string, value: string) => {
      // Replace existing field or append before END:VCARD
      const re = new RegExp(`^${name}(?:;[^:]*)?:.*$`, "im");
      if (re.test(vcard)) {
        vcard = vcard.replace(re, value ? `${name}:${value}` : "");
      } else if (value) {
        vcard = vcard.replace(/\r?\nEND:VCARD/i, `\r\n${name}:${value}\r\nEND:VCARD`);
      }
    };
    if (fields.fn !== undefined) setField("FN", fields.fn);
    if (fields.firstName !== undefined || fields.lastName !== undefined) {
      setField("N", `${fields.lastName ?? ""};${fields.firstName ?? ""};;;`);
    }
    if (fields.email !== undefined) setField("EMAIL", fields.email);
    if (fields.tel !== undefined) setField("TEL", fields.tel);
    if (fields.org !== undefined) setField("ORG", fields.org);
    // Clean up blank lines from removed fields
    vcard = vcard.replace(/(\r?\n){3,}/g, "\r\n");
    return vcard;
  }

  // Build a new vCard from scratch
  const uid = fields.uid || crypto.randomUUID();
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `UID:${uid}`,
    `FN:${fields.fn || ""}`,
    `N:${fields.lastName || ""};${fields.firstName || ""};;;`,
  ];
  if (fields.email) lines.push(`EMAIL:${fields.email}`);
  if (fields.tel) lines.push(`TEL:${fields.tel}`);
  if (fields.org) lines.push(`ORG:${fields.org}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

// ── Helpers ─────────────────────────────────────────────────────────
function extractVCardField(vcard: string, field: string): string {
  // Handles both simple (FN:value) and parameterized (TEL;TYPE=WORK:value)
  const re = new RegExp(`^${field}(?:;[^:]*)?:(.+)$`, "im");
  const m = vcard.match(re);
  return m ? m[1].trim() : "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
