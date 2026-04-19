import type { Request, Response } from "express";
import { listAddressBooks, listContacts, updateVCard, buildVCard, fetchVCard, createNewVCard, deleteVCard, type VCardFields } from "../services/carddav.js";
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

export async function getLinks(_req: Request, res: Response) {
  res.json(await loadLinks());
}

export async function createLink(req: Request, res: Response) {
  const { pbId, carddavHref } = req.body as { pbId?: string; carddavHref?: string };
  if (!pbId || !carddavHref) {
    res.status(400).json({ error: "Missing pbId or carddavHref" });
    return;
  }
  await setLink(pbId, carddavHref);
  console.log(`[Links] Linked PB:${pbId} ↔ CardDAV:${carddavHref}`);
  res.json({ ok: true });
}

export async function deleteLink(req: Request, res: Response) {
  const { pbId } = req.params;
  if (!pbId) {
    res.status(400).json({ error: "Missing pbId" });
    return;
  }
  await removeLink(pbId);
  console.log(`[Links] Unlinked PB:${pbId}`);
  res.json({ ok: true });
}

// ── Sync: push merged fields to Radicale ────────────────────────────

export async function createContact(req: Request, res: Response) {
  const { book, fields } = req.body as { book?: string; fields?: VCardFields };
  if (!book || !fields) {
    res.status(400).json({ error: "Missing book or fields" });
    return;
  }
  try {
    const { href } = await createNewVCard(book, fields);
    res.json({ ok: true, href });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] createContact error:", message);
    res.status(502).json({ error: message });
  }
}

export async function deleteContact(req: Request, res: Response) {
  const { href } = req.body as { href?: string };
  if (!href) {
    res.status(400).json({ error: "Missing href" });
    return;
  }
  try {
    // Also remove any PB link pointing to this href
    const links = await loadLinks();
    for (const [pbId, linkedHref] of Object.entries(links)) {
      if (linkedHref === href) {
        await removeLink(pbId);
        console.log(`[CardDAV] Auto-unlinked PB:${pbId} before delete`);
      }
    }
    await deleteVCard(href);
    console.log(`[CardDAV] Deleted ${href}`);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] deleteContact error:", message);
    res.status(502).json({ error: message });
  }
}

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
    // If no existingRaw provided, fetch the current vCard from Radicale to preserve all fields (photos, etc.)
    const raw = existingRaw || await fetchVCard(carddavHref);
    const vcard = buildVCard(fields, raw);
    await updateVCard(carddavHref, vcard, etag);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CardDAV] syncToRadicale error:", message);
    res.status(502).json({ error: message });
  }
}
