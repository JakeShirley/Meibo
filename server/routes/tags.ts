import type { Request, Response } from "express";
import { pbList, pbGetFullList, pbCreate, pbUpdate, pbDelete, pbGetCollection, type PBSchemaField } from "../services/pb.js";

const COLLECTION = "group_tags";

export async function listTags(req: Request, res: Response) {
  try {
    const col = await pbGetCollection(COLLECTION);
    const schema: PBSchemaField[] = col.schema ?? [];
    const textTypes = new Set(["text", "email", "url"]);
    const searchableFields = schema.filter((f) => textTypes.has(f.type)).map((f) => f.name);

    let filter = "";
    const search = req.query.search as string | undefined;
    if (search && searchableFields.length > 0) {
      const escaped = search.replace(/"/g, '\\"');
      filter = searchableFields.map((f) => `${f} ~ "${escaped}"`).join(" || ");
    }

    const result = await pbList(COLLECTION, {
      page: Number(req.query.page) || 1,
      perPage: Number(req.query.perPage) || 200,
      sort: (req.query.sort as string) || "",
      filter,
    });
    res.json(result);
  } catch (err) {
    console.error("[Tags] list error:", err);
    res.status(500).json({ error: "Failed to list tags" });
  }
}

export async function createTag(req: Request, res: Response) {
  try {
    const tag = await pbCreate(COLLECTION, req.body);
    res.status(201).json(tag);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

export async function updateTag(req: Request, res: Response) {
  try {
    const tag = await pbUpdate(COLLECTION, req.params.id, req.body);
    res.json(tag);
  } catch (err) {
    const e = err as Error & { status?: number; data?: unknown };
    res.status(e.status || 500).json(e.data || { error: e.message });
  }
}

export async function deleteTag(req: Request, res: Response) {
  try {
    await pbDelete(COLLECTION, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Tags] delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
}

export async function exportTags(req: Request, res: Response) {
  try {
    const format = (req.query.format as string) === "json" ? "json" : "csv";
    const items = await pbGetFullList(COLLECTION, {
      sort: (req.query.sort as string) || "",
    });

    const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated"]);
    const clean = items.map((item) => {
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(item)) {
        if (!SKIP.has(k)) row[k] = v;
      }
      return row;
    });

    if (format === "json") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", 'attachment; filename="tags.json"');
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
      res.setHeader("Content-Disposition", 'attachment; filename="tags.csv"');
      res.send([header, ...rows].join("\n"));
    }
  } catch (err) {
    console.error("[Tags] export error:", err);
    res.status(500).json({ error: "Export failed" });
  }
}
