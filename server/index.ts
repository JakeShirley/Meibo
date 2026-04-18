import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { handleAuth } from "./routes/auth.js";
import { handleGeocode } from "./routes/geocode.js";
import { createAddress, updateAddress, rehydrateAddresses, rehydrateOne } from "./routes/addresses.js";
import { pbProxy } from "./middleware/pbProxy.js";

const app = express();
const jsonParser = express.json();

// Custom API routes (handled before the PB proxy catch-all)
app.get("/api/geocode", handleGeocode);
app.post("/api/server/auth", handleAuth);
app.post("/api/collections/contact_addresses/records", jsonParser, createAddress);
app.patch("/api/collections/contact_addresses/records/:id", jsonParser, updateAddress);
app.post("/api/server/rehydrate-addresses", rehydrateAddresses);
app.post("/api/server/rehydrate-address/:id", rehydrateOne);

// Proxy /api/* to PocketBase (after custom routes above)
app.use("/api", pbProxy);

// Serve built client (production / Docker). Set CLIENT_DIST to override the
// default location, which is ../dist relative to this file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(
  process.env.CLIENT_DIST || path.join(__dirname, "..", "dist"),
);
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback — anything not matched above returns index.html
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
  console.log(`[Server] Serving client from ${clientDist}`);
}

app.listen(config.port, () => {
  console.log(`[Server] http://localhost:${config.port}`);
  console.log(`[Server] PocketBase: ${config.pocketbaseUrl}`);
});
