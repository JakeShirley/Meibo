import PocketBase from "pocketbase";

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
    // Auth via our server endpoint (credentials are server-side only)
    const res = await fetch("/api/server/auth", { method: "POST" });
    const data = await res.json();
    if (data.token) {
      pb.authStore.save(data.token, null);
    } else {
      console.error("[Auth] Server auth failed:", data.error);
    }
  } catch (err) {
    console.error("[Auth] Failed:", err);
  }
}

export default pb;
