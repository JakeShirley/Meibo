import type { Request, Response } from "express";
import { config } from "../config.js";
import { geocodeAddress } from "../services/geocode.js";
import type { GeoResult } from "../services/geocode.js";

const ADDRESS_FIELDS = ["address_street", "address_city", "address_state", "address_zip", "address_country"];

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

async function forwardToPocketBase(
  req: Request,
  res: Response,
  method: string,
  path: string,
  body: unknown,
  geo: GeoResult | null,
) {
  const url = `${config.pocketbaseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;

  try {
    const pbRes = await fetch(url, { method, headers, body: JSON.stringify(body) });
    const data = await pbRes.json().catch(() => null);

    // Attach geocode suggestion if the address differs from what was entered
    if (pbRes.ok && geo?.suggested_address && geo.match_code) {
      const result = data as Record<string, unknown>;
      result._geocode = {
        confidence: geo.match_code.confidence,
        match_code: geo.match_code,
        suggested_address: geo.suggested_address,
      };
    }

    res.status(pbRes.status).json(data);
  } catch (err) {
    console.error(`[Proxy] ${method} ${url} failed:`, err);
    res.status(502).json({ error: "Upstream error" });
  }
}

export async function createAddress(req: Request, res: Response) {
  const geo = await geocodeFromBody(req.body);
  return forwardToPocketBase(req, res, "POST", "/api/collections/contact_addresses/records", req.body, geo);
}

export async function updateAddress(req: Request, res: Response) {
  const geo = await geocodeFromBody(req.body);
  return forwardToPocketBase(req, res, "PATCH", `/api/collections/contact_addresses/records/${req.params.id}`, req.body, geo);
}

export async function rehydrateOne(req: Request, res: Response) {
  const id = req.params.id;
  console.log(`[Rehydrate] Single request for address ${id}`);
  const auth = req.headers.authorization;
  if (!auth) {
    console.warn(`[Rehydrate] Rejected — no auth token`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: auth };
  const url = `${config.pocketbaseUrl}/api/collections/contact_addresses/records/${id}`;

  try {
    console.log(`[Rehydrate] Fetching address ${id} from PocketBase`);
    const r = await fetch(url, { headers });
    if (!r.ok) {
      console.error(`[Rehydrate] PB returned ${r.status} for address ${id}`);
      return res.status(r.status).json(await r.json());
    }
    const addr = await r.json();

    const parts = ADDRESS_FIELDS.map((k) => String(addr[k] ?? "")).filter(Boolean);
    const query = parts.join(", ");
    if (parts.length === 0) {
      console.warn(`[Rehydrate] Address ${id} has no address fields to geocode`);
      return res.status(400).json({ error: "No address fields to geocode" });
    }

    console.log(`[Rehydrate] Geocoding: "${query}"`);
    const geo = await geocodeAddress(query);
    if (!geo) {
      console.warn(`[Rehydrate] Nominatim returned no results for: "${query}"`);
      return res.status(404).json({ error: "Address not found by Nominatim" });
    }

    console.log(`[Rehydrate] Result: ${geo.lat}, ${geo.lon} (${geo.display_name})`);
    const patchRes = await fetch(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ latitude: geo.lat, longitude: geo.lon }),
    });
    const updated = await patchRes.json();
    console.log(`[Rehydrate] Updated address ${id} — lat=${geo.lat}, lon=${geo.lon}`);
    res.json({ ...updated, _geo: { lat: geo.lat, lon: geo.lon, display_name: geo.display_name } });
  } catch (err) {
    console.error(`[Rehydrate] Error processing address ${id}:`, err);
    res.status(500).json({ error: "Geocode failed" });
  }
}

export async function rehydrateAddresses(req: Request, res: Response) {
  console.log(`[Rehydrate] Bulk rehydrate requested`);
  const auth = req.headers.authorization;
  if (!auth) {
    console.warn(`[Rehydrate] Rejected — no auth token`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: auth };
  const baseUrl = `${config.pocketbaseUrl}/api/collections/contact_addresses/records`;

  try {
    const all: Record<string, unknown>[] = [];
    let page = 1;
    while (true) {
      const r = await fetch(`${baseUrl}?perPage=200&page=${page}`, { headers });
      const data = await r.json();
      all.push(...data.items);
      if (page >= data.totalPages) break;
      page++;
    }
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
        console.log(`[Rehydrate] ${i + 1}/${all.length} — skipped (no address fields)`);
        continue;
      }

      const geo = await geocodeAddress(parts.join(", "));
      if (geo) {
        await fetch(`${baseUrl}/${addr.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ latitude: geo.lat, longitude: geo.lon }),
        });
        updated++;
        console.log(`[Rehydrate] ${i + 1}/${all.length} ✓ ${parts.join(", ")} → ${geo.lat}, ${geo.lon}`);
        send("progress", { i: i + 1, total: all.length, updated, skipped, failed, address: parts.join(", "), lat: geo.lat, lon: geo.lon });
      } else {
        failed++;
        console.log(`[Rehydrate] ${i + 1}/${all.length} ✗ ${parts.join(", ")} — not found`);
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
