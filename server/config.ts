import "dotenv/config";

const authUsername = process.env.MEIBO_AUTH_USERNAME ?? process.env.CONTACT_BOOK_AUTH_USERNAME ?? "";
const authPassword = process.env.MEIBO_AUTH_PASSWORD ?? process.env.CONTACT_BOOK_AUTH_PASSWORD ?? "";

if ((authUsername && !authPassword) || (!authUsername && authPassword)) {
  throw new Error(
    "MEIBO_AUTH_USERNAME and MEIBO_AUTH_PASSWORD must both be configured or both be omitted",
  );
}

export const config = {
  port: parseInt(process.env.SERVER_PORT || "3001", 10),
  pocketbaseUrl: process.env.POCKETBASE_URL || "http://127.0.0.1:8090",
  adminEmail: process.env.PB_ADMIN_EMAIL || "",
  adminPassword: process.env.PB_ADMIN_PASSWORD || "",
  mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || "",
  radicaleUrl: process.env.RADICALE_URL || "http://127.0.0.1:5232",
  radicaleUser: process.env.RADICALE_USER || "",
  radicalePassword: process.env.RADICALE_PASSWORD || "",
  auth: {
    username: authUsername,
    password: authPassword,
    enabled: Boolean(authUsername && authPassword),
  },
} as const;
