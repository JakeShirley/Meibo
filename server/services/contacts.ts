import {
  pbGetOne,
  pbCreate,
  pbUpdate,
  pbDelete,
  pbList,
  pbGetFullList,
  pbGetCollection,
  type PBListResult,
  type PBSchemaField,
} from "./pb.js";
import { loadLinks, setLink, removeLink } from "./links.js";
import { listContacts, fetchVCard, buildVCard, updateVCard, createNewVCard, type VCardFields } from "./carddav.js";
import { geocodeAddress } from "./geocode.js";

const COLLECTION = process.env.VITE_PB_COLLECTION || "contacts";
const ADDRESS_COLLECTION = "contact_addresses";
const ADDRESS_FIELDS = ["address_street", "address_city", "address_state", "address_zip", "address_country"];

// ── Schema helpers ──────────────────────────────────────────────────

interface NormalizedField {
  name: string;
  type: string;
  required: boolean;
  options?: Record<string, unknown>;
}

export async function getSchema(collectionName: string): Promise<{ fields: NormalizedField[] }> {
  const col = await pbGetCollection(collectionName);
  const fields: NormalizedField[] = [];
  const HIDDEN_FIELDS = new Set(["carddav_href"]);

  for (const f of col.schema) {
    if (HIDDEN_FIELDS.has(f.name)) continue;
    const normalized: NormalizedField = {
      name: f.name,
      type: f.type,
      required: !!f.required,
    };

    if (f.type === "relation" && f.options?.collectionId) {
      // Pre-resolve relation options
      const relColId = f.options.collectionId as string;
      try {
        const relCol = await pbGetCollection(relColId);
        const textTypes = new Set(["text", "email", "url"]);
        const labelFields = relCol.schema
          .filter((s) => textTypes.has(s.type))
          .map((s) => s.name);

        const items = await pbGetFullList(relCol.name, { sort: "created" });
        const options = items.map((item) => ({
          id: String(item.id),
          label: labelFields.map((lf) => item[lf]).filter(Boolean).join(" ") || String(item.id),
        }));

        normalized.options = {
          collectionId: relColId,
          collectionName: relCol.name,
          items: options,
          maxSelect: f.options.maxSelect ?? 1,
        };
      } catch {
        normalized.options = { collectionId: relColId };
      }
    } else if (f.options && Object.keys(f.options).length > 0) {
      normalized.options = f.options as Record<string, unknown>;
    }

    fields.push(normalized);
  }

  return { fields };
}

// ── Contact list (enriched) ─────────────────────────────────────────

export interface EnrichedListResult {
  items: Record<string, unknown>[];
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export async function listContacts_(opts: {
  page?: number;
  perPage?: number;
  sort?: string;
  search?: string;
  linked?: "all" | "linked" | "unlinked";
}): Promise<EnrichedListResult> {
  // Discover searchable fields from schema
  const col = await pbGetCollection(COLLECTION);
  const schema: PBSchemaField[] = col.schema ?? [];
  const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
  const searchableFields = schema.filter((f) => textTypes.has(f.type)).map((f) => f.name);
  const relationFields = schema.filter((f) => f.type === "relation");
  const expandFields = relationFields.map((f) => f.name);

  // Fetch related-collection schemas so we can flatten in field order
  const relatedFieldOrder: Record<string, string[]> = {};
  for (const f of relationFields) {
    const colId = f.options?.collectionId as string | undefined;
    if (colId) {
      try {
        const relCol = await pbGetCollection(colId);
        relatedFieldOrder[f.name] = relCol.schema.map((sf) => sf.name);
      } catch { /* skip */ }
    }
  }

  // Build filter from search + linked status
  const filters: string[] = [];
  if (opts.search && searchableFields.length > 0) {
    const escaped = opts.search.replace(/"/g, '\\"');
    filters.push(`(${searchableFields.map((f) => `${f} ~ "${escaped}"`).join(" || ")})`);
  }
  if (opts.linked === "linked") filters.push('carddav_href != ""');
  else if (opts.linked === "unlinked") filters.push('(carddav_href = "" || carddav_href = null)');
  const filter = filters.join(" && ");

  const result = await pbList(COLLECTION, {
    page: opts.page ?? 1,
    perPage: opts.perPage ?? 25,
    sort: opts.sort || "",
    filter,
    expand: expandFields.join(","),
  });

  // Build link map from results for photo enrichment
  const links: Record<string, string> = {};
  for (const item of result.items) {
    const href = item.carddav_href as string | undefined;
    if (href) links[String(item.id)] = href;
  }

  // Build photo map from CardDAV (cached per request)
  let photoMap: Record<string, string> = {};
  try {
    // Get all CardDAV contacts for photos
    const { listAddressBooks } = await import("./carddav.js");
    const books = await listAddressBooks();
    for (const book of books) {
      const davContacts = await listContacts(book.href);
      for (const [pbId, href] of Object.entries(links)) {
        const dav = davContacts.find((c) => c.href === href);
        if (dav?.photoUri) photoMap[pbId] = dav.photoUri;
      }
    }
  } catch {
    // CardDAV may be unavailable — continue without photos
  }

  // Flatten expanded relations and add enrichment
  const enriched = result.items.map((item) => {
    const flat: Record<string, unknown> = { ...item };
    const expand = item.expand as Record<string, Record<string, unknown>> | undefined;
    const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);

    if (expand) {
      for (const relField of expandFields) {
        const related = expand[relField];
        if (Array.isArray(related)) {
          // Multi-relation: join each sub-field from all related records
          const keys = related.length > 0
            ? (relatedFieldOrder[relField] ?? Object.keys(related[0]))
            : [];
          for (const key of keys) {
            if (SKIP.has(key)) continue;
            const vals = related
              .map((r: Record<string, unknown>) => r[key])
              .filter((v) => v !== undefined && typeof v !== "object");
            if (vals.length > 0) {
              flat[`${relField}.${key}`] = vals.join(", ");
            }
          }
        } else if (related && typeof related === "object") {
          const keys = relatedFieldOrder[relField] ?? Object.keys(related);
          for (const key of keys) {
            const val = (related as Record<string, unknown>)[key];
            if (val !== undefined && !SKIP.has(key) && typeof val !== "object") {
              flat[`${relField}.${key}`] = val;
            }
          }
        }
      }
    }

    flat._linked = !!item.carddav_href;
    flat._photoUri = photoMap[String(item.id)] || null;
    return flat;
  });

  return {
    items: enriched,
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  };
}

// ── Single contact ──────────────────────────────────────────────────

export async function getContact(id: string): Promise<Record<string, unknown>> {
  const col = await pbGetCollection(COLLECTION);
  const relationFields = col.schema.filter((f) => f.type === "relation");
  const expandFields = relationFields.map((f) => f.name);

  // Fetch related-collection schemas for field order
  const relatedFieldOrder: Record<string, string[]> = {};
  for (const f of relationFields) {
    const colId = f.options?.collectionId as string | undefined;
    if (colId) {
      try {
        const relCol = await pbGetCollection(colId);
        relatedFieldOrder[f.name] = relCol.schema.map((sf) => sf.name);
      } catch { /* skip */ }
    }
  }

  const contact = await pbGetOne(COLLECTION, id, expandFields.join(","));
  const flat: Record<string, unknown> = { ...contact };

  const expand = contact.expand as Record<string, unknown> | undefined;
  const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);
  if (expand) {
    for (const relField of expandFields) {
      const related = expand[relField];
      if (Array.isArray(related)) {
        const keys = related.length > 0
          ? (relatedFieldOrder[relField] ?? Object.keys(related[0]))
          : [];
        for (const key of keys) {
          if (SKIP.has(key)) continue;
          const vals = related
            .map((r: Record<string, unknown>) => r[key])
            .filter((v) => v !== undefined && typeof v !== "object");
          if (vals.length > 0) {
            flat[`${relField}.${key}`] = vals.join(", ");
          }
        }
      } else if (related && typeof related === "object") {
        const keys = relatedFieldOrder[relField] ?? Object.keys(related as Record<string, unknown>);
        for (const key of keys) {
          const val = (related as Record<string, unknown>)[key];
          if (val !== undefined && !SKIP.has(key) && typeof val !== "object") {
            flat[`${relField}.${key}`] = val;
          }
        }
      }
    }
  }

  const href = contact.carddav_href as string | undefined;
  flat._linked = !!href;
  flat._carddavHref = href || null;
  return flat;
}

// ── Create contact ──────────────────────────────────────────────────

export async function createContact_(data: Record<string, unknown>): Promise<Record<string, unknown>> {
  return pbCreate(COLLECTION, data);
}

// ── Update contact (with auto-sync) ─────────────────────────────────

export async function updateContact(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  const updated = await pbUpdate(COLLECTION, id, data);

  // Auto-sync to CardDAV if linked
  const href = updated.carddav_href as string | undefined;
  if (href) {
    try {
      await syncContactToCardDav(id, href);
    } catch (err) {
      console.error(`[Contacts] Auto-sync to CardDAV failed for ${id}:`, err);
      // Don't fail the update — the PB save succeeded
    }
  }

  return updated;
}

// ── Delete contact ──────────────────────────────────────────────────

export async function deleteContact(id: string): Promise<void> {
  await pbDelete(COLLECTION, id);
  // Link is deleted with the contact — no separate cleanup needed
}

// ── Sync helper ─────────────────────────────────────────────────────

async function syncContactToCardDav(pbId: string, carddavHref: string): Promise<void> {
  const col = await pbGetCollection(COLLECTION);
  const expandFields = col.schema.filter((f) => f.type === "relation").map((f) => f.name);
  const contact = await pbGetOne(COLLECTION, pbId, expandFields.join(","));

  const fields = extractVCardFields(contact);
  const raw = await fetchVCard(carddavHref);
  const vcard = buildVCard(fields, raw);
  await updateVCard(carddavHref, vcard);
  console.log(`[Contacts] Synced ${pbId} → CardDAV ${carddavHref}`);
}

function extractVCardFields(contact: Record<string, unknown>): VCardFields {
  const expand = contact.expand as Record<string, Record<string, unknown>> | undefined;
  const addr = expand?.current_address;

  return {
    fn: [contact.first_name, contact.last_name].filter(Boolean).map(String).join(" "),
    firstName: String(contact.first_name ?? ""),
    lastName: String(contact.last_name ?? ""),
    email: String(contact.email ?? ""),
    tel: String(contact.phone_number ?? ""),
    adrStreet: String(addr?.address_street ?? ""),
    adrCity: String(addr?.address_city ?? ""),
    adrState: String(addr?.address_state ?? ""),
    adrZip: String(addr?.address_zip ?? ""),
    adrCountry: String(addr?.address_country ?? ""),
    bdayMonth: Number(contact.birthday_month ?? 0),
    bdayDay: Number(contact.birthday_day ?? 0),
    bdayYear: Number(contact.birthday_year ?? 0),
  };
}

// ── Linking ─────────────────────────────────────────────────────────

export async function linkToExisting(pbId: string, carddavHref: string): Promise<void> {
  // Sync PB data → CardDAV
  await syncContactToCardDav(pbId, carddavHref);
  await setLink(pbId, carddavHref);
  console.log(`[Contacts] Linked ${pbId} ↔ ${carddavHref}`);
}

export async function linkCreateNew(pbId: string, book: string): Promise<{ href: string }> {
  const col = await pbGetCollection(COLLECTION);
  const expandFields = col.schema.filter((f) => f.type === "relation").map((f) => f.name);
  const contact = await pbGetOne(COLLECTION, pbId, expandFields.join(","));
  const fields = extractVCardFields(contact);

  const { href } = await createNewVCard(book, fields);
  await setLink(pbId, href);
  console.log(`[Contacts] Created & linked ${pbId} → ${href}`);
  return { href };
}

export async function unlinkContact(pbId: string): Promise<void> {
  await removeLink(pbId);
  console.log(`[Contacts] Unlinked ${pbId}`);
}

export interface MergeFieldSelections {
  first_name: "pb" | "carddav";
  last_name: "pb" | "carddav";
  email: "pb" | "carddav";
  phone_number: "pb" | "carddav";
  address: "pb" | "carddav";
  birthday: "pb" | "carddav";
}

export async function mergeAndLink(
  pbId: string,
  carddavHref: string,
  fieldSelections: MergeFieldSelections,
): Promise<void> {
  // Fetch both sides
  const col = await pbGetCollection(COLLECTION);
  const expandFields = col.schema.filter((f) => f.type === "relation").map((f) => f.name);
  const pbContact = await pbGetOne(COLLECTION, pbId, expandFields.join(","));

  const raw = await fetchVCard(carddavHref);
  // Parse CardDAV fields from raw vCard
  const davContacts = await listContacts(carddavHref.split("/").slice(0, -1).join("/") + "/");
  const davContact = davContacts.find((c) => c.href === carddavHref);

  if (!davContact) throw new Error(`CardDAV contact not found: ${carddavHref}`);

  // Parse dav first/last from N field
  const nMatch = raw.match(/^N(?:;[^:]*)?:([^;\r\n]*);([^;\r\n]*)/im);
  const davFirstName = nMatch?.[2]?.trim() || davContact.fn.split(/\s+/)[0] || "";
  const davLastName = nMatch?.[1]?.trim() || (davContact.fn.split(/\s+/).slice(1).join(" ")) || "";

  const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

  // Build merged values
  const merged = {
    first_name: fieldSelections.first_name === "pb" ? String(pbContact.first_name ?? "") : davFirstName,
    last_name: fieldSelections.last_name === "pb" ? String(pbContact.last_name ?? "") : davLastName,
    email: fieldSelections.email === "pb" ? String(pbContact.email ?? "") : davContact.email,
    phone_number: fieldSelections.phone_number === "pb" ? String(pbContact.phone_number ?? "") : davContact.tel,
    bdayMonth: fieldSelections.birthday === "pb" ? Number(pbContact.birthday_month ?? 0) : davContact.bdayMonth,
    bdayDay: fieldSelections.birthday === "pb" ? Number(pbContact.birthday_day ?? 0) : davContact.bdayDay,
    bdayYear: fieldSelections.birthday === "pb" ? Number(pbContact.birthday_year ?? 0) : davContact.bdayYear,
  };

  // Address — for PB, use expanded relation; for CardDAV, use structured address
  const pbAddr = (pbContact.expand as Record<string, Record<string, unknown>> | undefined)?.current_address;
  const adrStreet = fieldSelections.address === "pb" ? String(pbAddr?.address_street ?? "") : davContact.adrStreet;
  const adrCity = fieldSelections.address === "pb" ? String(pbAddr?.address_city ?? "") : davContact.adrCity;
  const adrState = fieldSelections.address === "pb" ? String(pbAddr?.address_state ?? "") : davContact.adrState;
  const adrZip = fieldSelections.address === "pb" ? String(pbAddr?.address_zip ?? "") : davContact.adrZip;
  const adrCountry = fieldSelections.address === "pb" ? String(pbAddr?.address_country ?? "") : davContact.adrCountry;

  // Normalize phone for PB: strip +1 country code, format as XXX-XXX-XXXX
  const phoneForPb = (() => {
    const digits = merged.phone_number.replace(/^\+1/, "").replace(/\D/g, "");
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    if (digits.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return merged.phone_number;
  })();

  // 1. Update PocketBase
  await pbUpdate(COLLECTION, pbId, {
    first_name: merged.first_name,
    last_name: merged.last_name,
    email: merged.email,
    phone_number: phoneForPb,
    birthday_month: merged.bdayMonth,
    birthday_day: merged.bdayDay,
    birthday_year: merged.bdayYear,
  });

  // 2. Update CardDAV
  const vcard = buildVCard(
    {
      fn: `${merged.first_name} ${merged.last_name}`.trim(),
      firstName: merged.first_name,
      lastName: merged.last_name,
      email: merged.email,
      tel: merged.phone_number,
      adrStreet,
      adrCity,
      adrState,
      adrZip,
      adrCountry,
      bdayMonth: merged.bdayMonth,
      bdayDay: merged.bdayDay,
      bdayYear: merged.bdayYear,
    },
    raw,
  );
  await updateVCard(carddavHref, vcard);

  // 3. Save link
  await setLink(pbId, carddavHref);
  console.log(`[Contacts] Merged & linked ${pbId} ↔ ${carddavHref}`);
}

// ── Map data ────────────────────────────────────────────────────────

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

export async function getMapPins(): Promise<MapPin[]> {
  const items = await pbGetFullList(COLLECTION, { expand: "current_address" });

  // Group contacts by address (using lat/lon as key)
  const pinMap = new Map<string, MapPin>();

  for (const c of items) {
    const expand = c.expand as Record<string, Record<string, unknown>> | undefined;
    const addr = expand?.current_address;
    if (!addr || typeof addr !== "object") continue;

    const lat = Number(addr.latitude);
    const lon = Number(addr.longitude);
    if (!lat && !lon) continue;

    const name = [c.first_name ?? c.name ?? "", c.last_name ?? ""]
      .map(String).filter(Boolean).join(" ") || String(c.id);
    const address = ADDRESS_FIELDS
      .map((k) => String(addr[k] ?? "")).filter(Boolean).join(", ");

    const key = `${lat},${lon}`;
    const addressId = String(addr.id ?? "");
    const existing = pinMap.get(key);
    if (existing) {
      existing.residents.push({ id: String(c.id), name });
    } else {
      pinMap.set(key, { lat, lon, address, addressId, residents: [{ id: String(c.id), name }] });
    }
  }

  return Array.from(pinMap.values());
}

// ── Export ───────────────────────────────────────────────────────────

export async function exportContacts(
  format: "csv" | "json",
  opts: { sort?: string; search?: string; filter?: string } = {},
): Promise<{ content: string; mime: string; filename: string }> {
  const col = await pbGetCollection(COLLECTION);
  const schema: PBSchemaField[] = col.schema ?? [];
  const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
  const searchableFields = schema.filter((f) => textTypes.has(f.type)).map((f) => f.name);
  const expandFields = schema.filter((f) => f.type === "relation").map((f) => f.name);

  let filter = "";
  if (opts.search && searchableFields.length > 0) {
    const escaped = opts.search.replace(/"/g, '\\"');
    filter = searchableFields.map((f) => `${f} ~ "${escaped}"`).join(" || ");
  }
  if (opts.filter) filter = filter ? `(${filter}) && (${opts.filter})` : opts.filter;

  const items = await pbGetFullList(COLLECTION, {
    sort: opts.sort || "",
    filter,
    expand: expandFields.join(","),
  });

  // Flatten
  const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);
  const flat = items.map((item) => {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (SKIP.has(k)) continue;
      if (k === "expand") continue;
      row[k] = v;
    }
    const expand = item.expand as Record<string, Record<string, unknown>> | undefined;
    if (expand) {
      for (const relField of expandFields) {
        const related = expand[relField];
        if (related && typeof related === "object" && !Array.isArray(related)) {
          for (const [key, val] of Object.entries(related)) {
            if (!SKIP.has(key) && typeof val !== "object") {
              row[`${relField}.${key}`] = val;
            }
          }
        }
      }
    }
    return row;
  });

  if (format === "json") {
    return {
      content: JSON.stringify(flat, null, 2),
      mime: "application/json",
      filename: "contacts.json",
    };
  }

  // CSV
  const fields = flat.length > 0 ? Object.keys(flat[0]) : [];
  const header = fields.join(",");
  const rows = flat.map((r) =>
    fields.map((f) => {
      const val = String(r[f] ?? "");
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(","),
  );
  return {
    content: [header, ...rows].join("\n"),
    mime: "text/csv",
    filename: "contacts.csv",
  };
}
