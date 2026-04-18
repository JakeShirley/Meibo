import type { Request, Response } from "express";
import { getSchema } from "../services/contacts.js";

const COLLECTION = process.env.VITE_PB_COLLECTION || "contacts";

export async function schemaContacts(_req: Request, res: Response) {
  try {
    const schema = await getSchema(COLLECTION);
    res.json(schema);
  } catch (err) {
    console.error("[Schema] contacts error:", err);
    res.status(500).json({ error: "Failed to fetch schema" });
  }
}

export async function schemaAddresses(_req: Request, res: Response) {
  try {
    const schema = await getSchema("contact_addresses");
    res.json(schema);
  } catch (err) {
    console.error("[Schema] addresses error:", err);
    res.status(500).json({ error: "Failed to fetch schema" });
  }
}

export async function schemaTags(_req: Request, res: Response) {
  try {
    const schema = await getSchema("group_tags");
    res.json(schema);
  } catch (err) {
    console.error("[Schema] tags error:", err);
    res.status(500).json({ error: "Failed to fetch schema" });
  }
}
