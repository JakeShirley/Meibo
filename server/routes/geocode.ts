import type { Request, Response } from "express";
import { geocodeAddress } from "../services/geocode.js";

export async function handleGeocode(req: Request, res: Response) {
  const q = req.query.q as string;
  if (!q) return res.status(400).json({ error: "Missing ?q= parameter" });
  const result = await geocodeAddress(q);
  if (!result) return res.status(404).json({ error: "Address not found" });
  res.json(result);
}
