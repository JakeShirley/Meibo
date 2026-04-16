import PocketBase from "pocketbase";

const pb = new PocketBase(
  import.meta.env.VITE_POCKETBASE_URL || "http://127.0.0.1:8090",
);

// Disable auto-cancellation to prevent StrictMode double-render issues
pb.autoCancellation(false);

console.log("[PB] URL:", import.meta.env.VITE_POCKETBASE_URL);
console.log("[PB] Collection:", import.meta.env.VITE_PB_COLLECTION);
console.log("[PB] Admin email configured:", !!import.meta.env.VITE_PB_ADMIN_EMAIL);

let authPromise: Promise<void> | null = null;

export function ensureAuthenticated(): Promise<void> {
  // Deduplicate concurrent auth calls
  if (!authPromise) {
    authPromise = doAuth().finally(() => { authPromise = null; });
  }
  return authPromise;
}

async function doAuth() {
  if (pb.authStore.isValid) {
    console.log("[PB Auth] Already authenticated, token valid");
    return;
  }

  const email = import.meta.env.VITE_PB_ADMIN_EMAIL;
  const password = import.meta.env.VITE_PB_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("[PB Auth] No admin credentials in env, skipping auth");
    return;
  }

  console.log("[PB Auth] Attempting admin auth with:", email);
  try {
    // Try new PB v0.23+ _superusers collection first
    const result = await pb.collection("_superusers").authWithPassword(email, password);
    console.log("[PB Auth] Success via _superusers! Token:", pb.authStore.token.slice(0, 20) + "...");
    console.log("[PB Auth] Auth model:", result.record?.email);
  } catch (err: unknown) {
    const isNotFound = err instanceof Error && "status" in err && (err as { status: number }).status === 404;
    if (isNotFound) {
      console.log("[PB Auth] _superusers not found, trying legacy /api/admins endpoint...");
      try {
        await pb.send("/api/admins/auth-with-password", {
          method: "POST",
          body: { identity: email, password },
        }).then((data: { token?: string }) => {
          if (data?.token) {
            pb.authStore.save(data.token, null);
          }
        });
        console.log("[PB Auth] Success via legacy admin endpoint! Token:", pb.authStore.token.slice(0, 20) + "...");
      } catch (legacyErr) {
        console.error("[PB Auth] Legacy admin auth also failed:", legacyErr);
        throw legacyErr;
      }
    } else {
      console.error("[PB Auth] Failed:", err);
      throw err;
    }
  }
}

export default pb;
