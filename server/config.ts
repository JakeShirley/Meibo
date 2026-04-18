import "dotenv/config";

export const config = {
  port: parseInt(process.env.SERVER_PORT || "3001", 10),
  pocketbaseUrl: process.env.POCKETBASE_URL || "http://127.0.0.1:8090",
  adminEmail: process.env.PB_ADMIN_EMAIL || "",
  adminPassword: process.env.PB_ADMIN_PASSWORD || "",
  mapboxToken: process.env.MAPBOX_ACCESS_TOKEN || "",
  radicaleUrl: process.env.RADICALE_URL || "http://127.0.0.1:5232",
  radicaleUser: process.env.RADICALE_USER || "",
  radicalePassword: process.env.RADICALE_PASSWORD || "",
} as const;
