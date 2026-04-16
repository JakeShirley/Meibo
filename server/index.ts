import "dotenv/config";
import express from "express";
import { config } from "./config.js";
import { handleAuth } from "./routes/auth.js";
import { handleGeocode } from "./routes/geocode.js";
import { createAddress, updateAddress } from "./routes/addresses.js";
import { pbProxy } from "./middleware/pbProxy.js";

const app = express();
const jsonParser = express.json();

// Custom API routes (handled before the PB proxy catch-all)
app.get("/api/geocode", handleGeocode);
app.post("/api/server/auth", handleAuth);
app.post("/api/collections/contact_addresses/records", jsonParser, createAddress);
app.patch("/api/collections/contact_addresses/records/:id", jsonParser, updateAddress);

// Proxy everything else to PocketBase
app.use("/api", pbProxy);

app.listen(config.port, () => {
  console.log(`[Server] http://localhost:${config.port}`);
  console.log(`[Server] PocketBase: ${config.pocketbaseUrl}`);
});
