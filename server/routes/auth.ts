import type { Request, Response } from "express";
import { getToken } from "../services/pb.js";

export async function handleAuth(_req: Request, res: Response) {
  try {
    const token = await getToken();
    res.json({ token });
  } catch (err) {
    console.error("[Auth] Failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Auth failed" });
  }
}
