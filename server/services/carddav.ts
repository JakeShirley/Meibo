import { config } from "../config.js";
import {
  type VCardFields,
  buildVCard,
  unfoldVCard,
  decodeXmlEntities,
  extractVCardField,
  extractBday,
  extractAdr,
  extractPhoto,
} from "./vcard.js";

export type { VCardFields };
export { buildVCard };

/** Minimal vCard parsed contact */
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
  adrSecondary: string;
  adrCity: string;
  adrState: string;
  adrZip: string;
  adrCountry: string;
  bdayYear: number;
  bdayMonth: number;
  bdayDay: number;
  raw: string;
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

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();

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

  const body = await davRequest(`/${user}/`, "PROPFIND", xml, "1");
  const books: AddressBook[] = [];

  // Simple XML extraction — handle both prefixed (d:response) and unprefixed (response)
  const responses = body.split(/<(?:[\w-]+:)?response[ >]/gi).slice(1);
  for (const r of responses) {
    // Only keep addressbook collections
    const isAddressBook = /<(?:[\w-]+:)?addressbook/i.test(r);
    const hrefMatch = r.match(/<(?:[\w-]+:)?href>([^<]+)<\//);
    if (!isAddressBook) continue;
    const nameMatch = r.match(/<(?:[\w-]+:)?displayname>([^<]*)<\//);
    if (hrefMatch) {
      books.push({
        href: hrefMatch[1],
        displayName: nameMatch?.[1] || hrefMatch[1],
      });
    }
  }
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

  const body = await davRequest(addressBookHref, "REPORT", xml, "1");
  const contacts: CardDavContact[] = [];

  const responses = body.split(/<(?:[\w-]+:)?response[ >]/gi).slice(1);
  for (const r of responses) {
    const hrefMatch = r.match(/<(?:[\w-]+:)?href>([^<]+)<\//);
    const etagMatch = r.match(/<(?:[\w-]+:)?getetag>"?([^"<]+)"?<\//);
    const vcardMatch = r.match(/<(?:[\w-]+:)?address-data[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?address-data>/i);
    if (!hrefMatch || !vcardMatch) continue;

    const raw = unfoldVCard(decodeXmlEntities(vcardMatch[1].trim()));
    const photoUri = extractPhoto(raw);
    const adr = extractAdr(raw);
    const bday = extractBday(raw);
    contacts.push({
      uid: extractVCardField(raw, "UID") || hrefMatch[1],
      href: hrefMatch[1],
      etag: etagMatch?.[1] || "",
      fn: extractVCardField(raw, "FN") || "",
      email: extractVCardField(raw, "EMAIL") || "",
      tel: extractVCardField(raw, "TEL") || "",
      org: extractVCardField(raw, "ORG") || "",
      photoUri,
      adrStreet: adr.street,
      adrSecondary: adr.secondary,
      adrCity: adr.city,
      adrState: adr.state,
      adrZip: adr.zip,
      adrCountry: adr.country,
      bdayYear: bday.year,
      bdayMonth: bday.month,
      bdayDay: bday.day,
      raw,
    });
  }

  return contacts;
}

// ── Fetch a single vCard from Radicale ──────────────────────────────
export async function fetchVCard(href: string): Promise<string> {
  const base = config.radicaleUrl.replace(/\/+$/, "");
  const url = `${base}${href.startsWith("/") ? "" : "/"}${href}`;
  const headers: Record<string, string> = {};
  const auth = authHeader();
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CardDAV GET ${href} failed (${res.status}): ${text}`);
  }
  return res.text();
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

  const res = await fetch(url, { method: "PUT", headers, body: vcard });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CardDAV PUT ${href} failed (${res.status}): ${text}`);
  }
}

// ── Create a brand-new vCard on Radicale ────────────────────────────
export async function createNewVCard(
  addressBookHref: string,
  fields: VCardFields,
): Promise<{ href: string }> {
  const uid = fields.uid || crypto.randomUUID();
  const href = `${addressBookHref.replace(/\/+$/, "")}/${uid}.vcf`;
  const vcard = buildVCard({ ...fields, uid });

  const base = config.radicaleUrl.replace(/\/+$/, "");
  const url = `${base}${href.startsWith("/") ? "" : "/"}${href}`;
  const headers: Record<string, string> = {
    "Content-Type": "text/vcard; charset=utf-8",
    "If-None-Match": "*", // fail if it already exists
  };
  const auth = authHeader();
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { method: "PUT", headers, body: vcard });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CardDAV PUT (create) ${href} failed (${res.status}): ${text}`);
  }
  return { href };
}

// ── Delete a vCard from Radicale ─────────────────────────────────────
export async function deleteVCard(href: string): Promise<void> {
  const base = config.radicaleUrl.replace(/\/+$/, "");
  const url = `${base}${href.startsWith("/") ? "" : "/"}${href}`;
  const headers: Record<string, string> = {};
  const auth = authHeader();
  if (auth) headers.Authorization = auth;

  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`CardDAV DELETE ${href} failed (${res.status}): ${text}`);
  }
}
