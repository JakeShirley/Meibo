import type { Request, Response } from "express";
import { config } from "../config.js";

export async function handleAuth(_req: Request, res: Response) {
  const { pocketbaseUrl, adminEmail, adminPassword } = config;

  if (!adminEmail || !adminPassword) {
    return res.status(500).json({ error: "Admin credentials not configured" });
  }

  try {
    // Try legacy admin endpoint, fall back to _superusers
    let pbRes = await fetch(`${pocketbaseUrl}/api/admins/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
    });

    if (pbRes.status === 404) {
      pbRes = await fetch(`${pocketbaseUrl}/api/collections/_superusers/records/auth-with-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identity: adminEmail, password: adminPassword }),
      });
    }

    const data = await pbRes.json();
    if (!pbRes.ok) return res.status(pbRes.status).json(data);
    res.json({ token: data.token });
  } catch (err) {
    console.error("[Auth] Failed:", err);
    res.status(500).json({ error: "Auth failed" });
  }
}
