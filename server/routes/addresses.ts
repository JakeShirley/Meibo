import type { Request, Response } from "express";
import { config } from "../config.js";
import { geocodeAddress } from "../services/geocode.js";

const ADDRESS_FIELDS = ["address_street", "address_city", "address_state", "address_zip", "address_country"];

async function attachGeocode(body: Record<string, unknown>) {
  const parts = ADDRESS_FIELDS.map((k) => String(body[k] ?? "")).filter(Boolean);
  if (parts.length === 0) return;

  const geo = await geocodeAddress(parts.join(", "));
  if (geo) {
    body.latitude = geo.lat;
    body.longitude = geo.lon;
    console.log(`[Geocode] ${parts.join(", ")} → ${geo.lat}, ${geo.lon}`);
  }
}

async function forwardToPocketBase(
  req: Request,
  res: Response,
  method: string,
  path: string,
  body: unknown,
) {
  const url = `${config.pocketbaseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (req.headers.authorization) headers["Authorization"] = req.headers.authorization;

  try {
    const pbRes = await fetch(url, { method, headers, body: JSON.stringify(body) });
    const data = await pbRes.json().catch(() => null);
    res.status(pbRes.status).json(data);
  } catch (err) {
    console.error(`[Proxy] ${method} ${url} failed:`, err);
    res.status(502).json({ error: "Upstream error" });
  }
}

export async function createAddress(req: Request, res: Response) {
  await attachGeocode(req.body);
  return forwardToPocketBase(req, res, "POST", "/api/collections/contact_addresses/records", req.body);
}

export async function updateAddress(req: Request, res: Response) {
  await attachGeocode(req.body);
  return forwardToPocketBase(req, res, "PATCH", `/api/collections/contact_addresses/records/${req.params.id}`, req.body);
}
