import PocketBase from "pocketbase";
import { ensureAuthenticated as ensureApiAuthenticated, getToken } from "./api.ts";

// Point PocketBase SDK at our Express server (proxied via Vite in dev)
// In dev: Vite proxies /api/* → Express → PocketBase
// The PB SDK just needs to think it's talking to a PB instance
const pb = new PocketBase("/");

pb.autoCancellation(false);

let authPromise: Promise<void> | null = null;

export function ensureAuthenticated(): Promise<void> {
  if (!authPromise) {
    authPromise = doAuth().finally(() => { authPromise = null; });
  }
  return authPromise;
}

async function doAuth() {
  if (pb.authStore.isValid) return;

  try {
    await ensureApiAuthenticated();
    const token = getToken();
    if (token) pb.authStore.save(token, null);
  } catch (err) {
    console.error("[Auth] Failed:", err);
  }
}

export default pb;
