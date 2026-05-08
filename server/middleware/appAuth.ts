import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

interface AuthTokenPayload {
  sub: string;
  exp: number;
  nonce: string;
}

function toBase64Url(value: string | Buffer): string {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function hash(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

function constantTimeEqual(left: string, right: string): boolean {
  return crypto.timingSafeEqual(hash(left), hash(right));
}

function signingSecret(): Buffer {
  return hash(`contact-book-auth-v1:${config.auth.username}:${config.auth.password}`);
}

function sign(value: string): string {
  return toBase64Url(crypto.createHmac("sha256", signingSecret()).update(value).digest());
}

function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function isAppAuthEnabled(): boolean {
  return config.auth.enabled;
}

export function credentialsAreValid(username: string, password: string): boolean {
  if (!isAppAuthEnabled()) return true;
  return constantTimeEqual(username, config.auth.username)
    && constantTimeEqual(password, config.auth.password);
}

export function createAppAuthToken(): string {
  const payload: AuthTokenPayload = {
    sub: config.auth.username,
    exp: Date.now() + TOKEN_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAppAuthToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return false;
  if (signature.length !== sign(encodedPayload).length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(encodedPayload)))) return false;

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as Partial<AuthTokenPayload>;
    return payload.sub === config.auth.username
      && typeof payload.exp === "number"
      && payload.exp > Date.now();
  } catch {
    return false;
  }
}

export function isRequestAuthenticated(req: Request): boolean {
  if (!isAppAuthEnabled()) return true;
  const token = readBearerToken(req.get("authorization"));
  return token ? verifyAppAuthToken(token) : false;
}

export function requireAppAuth(req: Request, res: Response, next: NextFunction) {
  if (isRequestAuthenticated(req)) {
    next();
    return;
  }

  res.status(401).json({
    error: "Authentication required",
    authEnabled: true,
    authenticated: false,
  });
}