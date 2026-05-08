import type { Request, Response } from "express";
import {
  createAppAuthToken,
  credentialsAreValid,
  isAppAuthEnabled,
  isRequestAuthenticated,
} from "../middleware/appAuth.js";

export function handleAuth(req: Request, res: Response) {
  if (!isAppAuthEnabled()) {
    res.json({ authEnabled: false, authenticated: true });
    return;
  }

  if (isRequestAuthenticated(req)) {
    res.json({ authEnabled: true, authenticated: true });
    return;
  }

  const body = req.body as { username?: unknown; password?: unknown } | undefined;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!credentialsAreValid(username, password)) {
    res.status(401).json({
      error: "Invalid username or password",
      authEnabled: true,
      authenticated: false,
    });
    return;
  }

  res.json({
    authEnabled: true,
    authenticated: true,
    token: createAppAuthToken(),
  });
}
