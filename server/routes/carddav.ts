import type { Request, Response } from "express";
import { listAddressBooks, listContacts, updateVCard, buildVCard, type VCardFields } from "../services/carddav.js";
import { loadLinks, setLink, removeLink } from "../services/links.js";

export async function getAddressBooks(_req: Request, res: Response) {
  try {
    const books = await listAddressBooks();
    res.json(books);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] listAddressBooks error:", message);
    res.status(502).json({ error: message });
  }
}

export async function getContacts(req: Request, res: Response) {
  const bookHref = req.query.book as string | undefined;
  if (!bookHref) {
    res.status(400).json({ error: "Missing ?book= query parameter" });
    return;
  }
  try {
    const contacts = await listContacts(bookHref);
    res.json(contacts);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] listContacts error:", message);
    res.status(502).json({ error: message });
  }
}

// ── Link CRUD ───────────────────────────────────────────────────────

export function getLinks(_req: Request, res: Response) {
  res.json(loadLinks());
}

export function createLink(req: Request, res: Response) {
  const { pbId, carddavHref } = req.body as { pbId?: string; carddavHref?: string };
  if (!pbId || !carddavHref) {
    res.status(400).json({ error: "Missing pbId or carddavHref" });
    return;
  }
  setLink(pbId, carddavHref);
  console.log(`[Links] Linked PB:${pbId} ↔ CardDAV:${carddavHref}`);
  res.json({ ok: true });
}

export function deleteLink(req: Request, res: Response) {
  const { pbId } = req.params;
  if (!pbId) {
    res.status(400).json({ error: "Missing pbId" });
    return;
  }
  removeLink(pbId);
  console.log(`[Links] Unlinked PB:${pbId}`);
  res.json({ ok: true });
}

// ── Sync: push merged fields to Radicale ────────────────────────────

export async function syncToRadicale(req: Request, res: Response) {
  const { carddavHref, fields, existingRaw, etag } = req.body as {
    carddavHref?: string;
    fields?: VCardFields;
    existingRaw?: string;
    etag?: string;
  };
  if (!carddavHref || !fields) {
    res.status(400).json({ error: "Missing carddavHref or fields" });
    return;
  }
  try {
    const vcard = buildVCard(fields, existingRaw);
    await updateVCard(carddavHref, vcard, etag);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] syncToRadicale error:", message);
    res.status(502).json({ error: message });
  }
}
