import type { Request, Response } from "express";
import {
  listContacts_,
  getContact,
  createContact_,
  updateContact,
  deleteContact,
  bulkUpdateContacts,
  linkToExisting,
  linkCreateNew,
  unlinkContact,
  mergeAndLink,
  getMapPins,
  exportContacts,
  uploadContactPhoto,
  clearContactPhoto,
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
      filter: (req.query.filter as string) || "",
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

export async function bulkUpdateRoute(req: Request, res: Response) {
  const { ids, data, mode } = req.body as {
    ids?: string[];
    data?: Record<string, unknown>;
    mode?: "set" | "add" | "remove";
  };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Missing or empty ids array" });
  }
  if (!data || typeof data !== "object") {
    return res.status(400).json({ error: "Missing data object" });
  }
  try {
    const result = await bulkUpdateContacts(ids, data, mode || "set");
    res.json(result);
  } catch (err) {
    console.error("[Contacts] bulk update error:", err);
    res.status(500).json({ error: "Bulk update failed" });
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
    // Build tag filter if provided (comma-separated tag IDs)
    const tagIds = (req.query.tags as string || "").split(",").filter(Boolean);
    let tagFilter = "";
    if (tagIds.length > 0) {
      tagFilter = tagIds.map((id) => `group_tag ~ "${id}"`).join(" || ");
    }
    const exportFields = (req.query.fields as string || "").split(",").filter(Boolean);
    const combineHouseholds = req.query.combine === "true";
    const dropDomesticCountry = req.query.dropcountry !== "false"; // default true
    const addrParam = req.query.addrformat as string || "single";
    const addressFormat = (addrParam === "separated" ? "separated" : addrParam === "street-separated" ? "street-separated" : "single") as "single" | "separated" | "street-separated";
    const result = await exportContacts(format, {
      sort: (req.query.sort as string) || "",
      search: (req.query.search as string) || "",
      filter: tagFilter,
      fields: exportFields.length > 0 ? exportFields : undefined,
      combineHouseholds,
      dropDomesticCountry,
      addressFormat,
    });
    res.setHeader("Content-Type", result.mime);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.content);
  } catch (err) {
    console.error("[Contacts] export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
}

export async function uploadPhotoRoute(req: Request, res: Response) {
  const { photo, mime } = req.body as { photo?: string; mime?: string };
  if (!photo || !mime) {
    return res.status(400).json({ error: "Missing photo or mime" });
  }
  // Validate mime type
  const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (!allowed.has(mime)) {
    return res.status(400).json({ error: "Unsupported image type" });
  }
  // Validate base64 (basic check — reject if too large or invalid chars)
  if (photo.length > 5 * 1024 * 1024) {
    return res.status(400).json({ error: "Photo too large (max 5MB base64)" });
  }
  try {
    const result = await uploadContactPhoto(req.params.id, photo, mime);
    res.json(result);
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error("[Contacts] photo upload error:", err);
    res.status(e.status || 500).json({ error: e.message || "Photo upload failed" });
  }
}

export async function deletePhotoRoute(req: Request, res: Response) {
  try {
    await clearContactPhoto(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error("[Contacts] photo delete error:", err);
    res.status(e.status || 500).json({ error: e.message || "Photo delete failed" });
  }
}
