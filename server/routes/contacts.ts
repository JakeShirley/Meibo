import type { Request, Response } from "express";
import {
  listContacts_,
  getContact,
  createContact_,
  updateContact,
  deleteContact,
  linkToExisting,
  linkCreateNew,
  unlinkContact,
  mergeAndLink,
  getMapPins,
  exportContacts,
  type MergeFieldSelections,
} from "../services/contacts.js";

export async function listContactsRoute(req: Request, res: Response) {
  try {
    const result = await listContacts_({
      page: Number(req.query.page) || 1,
      perPage: Number(req.query.perPage) || 25,
      sort: (req.query.sort as string) || "",
      search: (req.query.search as string) || "",
      linked: (req.query.linked as "all" | "linked" | "unlinked") || "all",
    });
    res.json(result);
  } catch (err) {
    console.error("[Contacts] list error:", err);
    res.status(500).json({ error: "Failed to list contacts" });
  }
}

export async function getContactRoute(req: Request, res: Response) {
  try {
    const contact = await getContact(req.params.id);
    res.json(contact);
  } catch (err) {
    console.error("[Contacts] get error:", err);
    res.status(404).json({ error: "Contact not found" });
  }
}

export async function createContactRoute(req: Request, res: Response) {
  try {
    const contact = await createContact_(req.body);
    res.status(201).json(contact);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

export async function updateContactRoute(req: Request, res: Response) {
  try {
    const contact = await updateContact(req.params.id, req.body);
    res.json(contact);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

export async function deleteContactRoute(req: Request, res: Response) {
  try {
    await deleteContact(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Contacts] delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
}

export async function linkContactRoute(req: Request, res: Response) {
  const { carddavHref } = req.body as { carddavHref?: string };
  if (!carddavHref) return res.status(400).json({ error: "Missing carddavHref" });
  try {
    await linkToExisting(req.params.id, carddavHref);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Contacts] link error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Link failed" });
  }
}

export async function linkCreateRoute(req: Request, res: Response) {
  const { book } = req.body as { book?: string };
  if (!book) return res.status(400).json({ error: "Missing book" });
  try {
    const result = await linkCreateNew(req.params.id, book);
    res.json(result);
  } catch (err) {
    console.error("[Contacts] link/create error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Link/create failed" });
  }
}

export async function unlinkContactRoute(req: Request, res: Response) {
  try {
    await unlinkContact(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Contacts] unlink error:", err);
    res.status(500).json({ error: "Unlink failed" });
  }
}

export async function mergeContactRoute(req: Request, res: Response) {
  const { carddavHref, fieldSelections } = req.body as {
    carddavHref?: string;
    fieldSelections?: MergeFieldSelections;
  };
  if (!carddavHref || !fieldSelections) {
    return res.status(400).json({ error: "Missing carddavHref or fieldSelections" });
  }
  try {
    await mergeAndLink(req.params.id, carddavHref, fieldSelections);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Contacts] merge error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Merge failed" });
  }
}

export async function mapContactsRoute(_req: Request, res: Response) {
  try {
    const pins = await getMapPins();
    res.json(pins);
  } catch (err) {
    console.error("[Contacts] map error:", err);
    res.status(500).json({ error: "Failed to get map data" });
  }
}

export async function exportContactsRoute(req: Request, res: Response) {
  try {
    const format = (req.query.format as string) === "json" ? "json" : "csv";
    const result = await exportContacts(format, {
      sort: (req.query.sort as string) || "",
      search: (req.query.search as string) || "",
    });
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    console.error("[Contacts] export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
}
