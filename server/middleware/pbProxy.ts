import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { config } from "../config.js";

const proxy = createProxyMiddleware({
  target: config.pocketbaseUrl,
  changeOrigin: true,
});

/**
 * Proxy catch-all for /api/* → PocketBase.
 * Express strips the /api prefix when mounted with app.use("/api", ...),
 * so we restore it before forwarding.
 */
export function pbProxy(req: Request, res: Response, next: NextFunction) {
  req.url = `/api${req.url}`;
  proxy(req, res, next);
}
