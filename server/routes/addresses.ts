import type { Request, Response } from "express";
import { geocodeAddress } from "../services/geocode.js";
import type { GeoResult } from "../services/geocode.js";
import { pbList, pbGetFullList, pbGetOne, pbCreate, pbUpdate, pbDelete, pbGetCollection, type PBSchemaField } from "../services/pb.js";

const COLLECTION = "contact_addresses";
const ADDRESS_FIELDS = ["address_street", "address_secondary", "address_city", "address_state", "address_zip", "address_country"];

let cachedCountryValues: string[] | null = null;

async function getCountryValues(): Promise<string[]> {
  if (cachedCountryValues) return cachedCountryValues;
  try {
    const col = await pbGetCollection(COLLECTION);
    const field = col.schema.find((f) => f.name === "address_country");
    const values = (field?.options as { values?: string[] })?.values ?? [];
    cachedCountryValues = values;
    return values;
  } catch {
    return [];
  }
}

function matchCountry(mapboxName: string, allowed: string[]): string {
  if (!mapboxName) return "";
  const exact = allowed.find((v) => v === mapboxName);
  if (exact) return exact;
  const lower = mapboxName.toLowerCase();
  const startsWith = allowed.find((v) => v.toLowerCase().startsWith(lower));
  if (startsWith) return startsWith;
  const includes = allowed.find((v) => v.toLowerCase().includes(lower));
  if (includes) return includes;
  return mapboxName;
}

async function geocodeFromBody(body: Record<string, unknown>): Promise<GeoResult | null> {
  const parts = ADDRESS_FIELDS.map((k) => String(body[k] ?? "")).filter(Boolean);
  if (parts.length === 0) return null;

  const geo = await geocodeAddress(parts.join(", "));
  if (geo) {
    body.latitude = geo.lat;
    body.longitude = geo.lon;
    console.log(`[Geocode] ${parts.join(", ")} → ${geo.lat}, ${geo.lon} (confidence: ${geo.match_code?.confidence || "n/a"})`);
  }
  return geo;
}

// ── List ─────────────────────────────────────────────────────────────

export async function listAddresses(req: Request, res: Response) {
  try {
    const col = await pbGetCollection(COLLECTION);
    const schema: PBSchemaField[] = col.schema ?? [];
    const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
    const searchableFields = schema.filter((f) => textTypes.has(f.type)).map((f) => f.name);
    const expandFields = schema.filter((f) => f.type === "relation").map((f) => f.name);

    let filter = "";
    const search = req.query.search as string | undefined;
    if (search && searchableFields.length > 0) {
      const escaped = search.replace(/"/g, '\\"');
      filter = searchableFields.map((f) => `${f} ~ "${escaped}"`).join(" || ");
    }

    const result = await pbList(COLLECTION, {
      page: Number(req.query.page) || 1,
      perPage: Number(req.query.perPage) || 25,
      sort: (req.query.sort as string) || "",
      filter,
      expand: expandFields.join(","),
    });

    // Flatten expanded relations
    const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);
    const items = result.items.map((item) => {
      const flat: Record<string, unknown> = { ...item };
      const expand = item.expand as Record<string, Record<string, unknown> | Record<string, unknown>[]> | undefined;
      if (expand) {
        for (const relField of expandFields) {
          const related = expand[relField];
          if (Array.isArray(related)) {
            // Multi-relation: build array of {id, label} for the client
            flat[`${relField}._resolved`] = related.map((r) => {
              const label = [r.first_name, r.last_name, r.name]
                .filter(Boolean).map(String).join(" ") || String(r.id);
              return { id: String(r.id), label };
            });
          } else if (related && typeof related === "object") {
            for (const [key, val] of Object.entries(related)) {
              if (!SKIP.has(key) && typeof val !== "object") {
                flat[`${relField}.${key}`] = val;
              }
            }
          }
        }
      }
      return flat;
    });

    res.json({ ...result, items });
  } catch (err) {
    console.error("[Addresses] list error:", err);
    res.status(500).json({ error: "Failed to list addresses" });
  }
}

// ── Get single ───────────────────────────────────────────────────────

export async function getAddress(req: Request, res: Response) {
  try {
    const addr = await pbGetOne(COLLECTION, req.params.id);
    res.json(addr);
  } catch (err) {
    console.error("[Addresses] get error:", err);
    res.status(404).json({ error: "Address not found" });
  }
}

// ── Create ───────────────────────────────────────────────────────────

export async function createAddress(req: Request, res: Response) {
  try {
    const geo = await geocodeFromBody(req.body);
    const record = await pbCreate(COLLECTION, req.body);

    if (geo?.suggested_address && geo.match_code) {
      const countryValues = await getCountryValues();
      geo.suggested_address.country = matchCountry(geo.suggested_address.country, countryValues);
      (record as Record<string, unknown>)._geocode = {
        confidence: geo.match_code.confidence,
        match_code: geo.match_code,
        suggested_address: geo.suggested_address,
      };
    }

    res.status(201).json(record);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

// ── Update ───────────────────────────────────────────────────────────

export async function updateAddress(req: Request, res: Response) {
  try {
    const geo = await geocodeFromBody(req.body);
    const record = await pbUpdate(COLLECTION, req.params.id, req.body);

    if (geo?.suggested_address && geo.match_code) {
      const countryValues = await getCountryValues();
      geo.suggested_address.country = matchCountry(geo.suggested_address.country, countryValues);
      (record as Record<string, unknown>)._geocode = {
        confidence: geo.match_code.confidence,
        match_code: geo.match_code,
        suggested_address: geo.suggested_address,
      };
    }

    res.json(record);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

// ── Delete ───────────────────────────────────────────────────────────

export async function deleteAddress(req: Request, res: Response) {
  try {
    await pbDelete(COLLECTION, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Addresses] delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
}

// ── Export ────────────────────────────────────────────────────────────

export async function exportAddresses(req: Request, res: Response) {
  try {
    const format = (req.query.format as string) === "json" ? "json" : "csv";
    const col = await pbGetCollection(COLLECTION);
    const schema: PBSchemaField[] = col.schema ?? [];
    const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
    const searchableFields = schema.filter((f) => textTypes.has(f.type)).map((f) => f.name);
    const expandFields = schema.filter((f) => f.type === "relation").map((f) => f.name);

    let filter = "";
    const search = req.query.search as string | undefined;
    if (search && searchableFields.length > 0) {
      const escaped = search.replace(/"/g, '\\"');
      filter = searchableFields.map((f) => `${f} ~ "${escaped}"`).join(" || ");
    }

    const items = await pbGetFullList(COLLECTION, {
      sort: (req.query.sort as string) || "",
      filter,
      expand: expandFields.join(","),
    });

    const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);
    const clean = items.map((item) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!SKIP.has(k)) row[k] = v;
      }
      return row;
    });

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="addresses.json"');
      res.send(JSON.stringify(clean, null, 2));
    } else {
      const fields = clean.length > 0 ? Object.keys(clean[0]) : [];
      const header = fields.join(",");
      const rows = clean.map((r) =>
        fields.map((f) => {
          const val = String(r[f] ?? "");
          if (val.includes(",") || val.includes('"') || val.includes("\n")) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(","),
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", 'attachment; filename="addresses.csv"');
      res.send([header, ...rows].join("\n"));
    }
  } catch (err) {
    console.error("[Addresses] export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
}

// ── Rehydrate ────────────────────────────────────────────────────────

export async function rehydrateOne(req: Request, res: Response) {
  const id = req.params.id;
  console.log(`[Rehydrate] Single request for address ${id}`);
  try {
    const addr = await pbGetOne(COLLECTION, id);

    const parts = ADDRESS_FIELDS.map((k) => String(addr[k] ?? "")).filter(Boolean);
    const query = parts.join(", ");
    if (parts.length === 0) {
      return res.status(400).json({ error: "No address fields to geocode" });
    }

    console.log(`[Rehydrate] Geocoding: "${query}"`);
    const geo = await geocodeAddress(query);
    if (!geo) {
      return res.status(404).json({ error: "Address not found by geocoder" });
    }

    console.log(`[Rehydrate] Result: ${geo.lat}, ${geo.lon} (${geo.display_name})`);
    const updated = await pbUpdate(COLLECTION, id, { latitude: geo.lat, longitude: geo.lon });
    res.json({ ...updated, _geo: { lat: geo.lat, lon: geo.lon, display_name: geo.display_name } });
  } catch (err) {
    console.error(`[Rehydrate] Error processing address ${id}:`, err);
    res.status(500).json({ error: "Geocode failed" });
  }
}

export async function rehydrateAddresses(_req: Request, res: Response) {
  console.log(`[Rehydrate] Bulk rehydrate requested`);
  try {
    const all = await pbGetFullList(COLLECTION);
    console.log(`[Rehydrate] Fetched ${all.length} addresses from PocketBase`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < all.length; i++) {
      const addr = all[i];
      const parts = ADDRESS_FIELDS.map((k) => String(addr[k] ?? "")).filter(Boolean);
      if (parts.length === 0) {
        skipped++;
        continue;
      }

      const geo = await geocodeAddress(parts.join(", "));
      if (geo) {
        await pbUpdate(COLLECTION, String(addr.id), { latitude: geo.lat, longitude: geo.lon });
        updated++;
        send("progress", { i: i + 1, total: all.length, updated, skipped, failed, address: parts.join(", "), lat: geo.lat, lon: geo.lon });
      } else {
        failed++;
        send("progress", { i: i + 1, total: all.length, updated, skipped, failed, address: parts.join(", "), error: "not found" });
      }
    }

    console.log(`[Rehydrate] Complete: ${updated} geocoded, ${failed} failed, ${skipped} skipped out of ${all.length}`);
    send("done", { updated, skipped, failed, total: all.length });
    res.end();
  } catch (err) {
    console.error("[Rehydrate] Bulk rehydrate failed:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Rehydrate failed" });
    } else {
      res.end();
    }
  }
}
