import "dotenv/config";
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { handleAuth } from "./routes/auth.js";
import { handleGeocode } from "./routes/geocode.js";
import {
  listAddresses,
  getAddress,
  createAddress,
  updateAddress,
  deleteAddress,
  exportAddresses,
  rehydrateOne,
  rehydrateAddresses,
} from "./routes/addresses.js";
import { getAddressBooks, getContacts, getLinks, createLink, deleteLink, syncToRadicale, createContact, deleteContact } from "./routes/carddav.js";
import {
  listContactsRoute,
  getContactRoute,
  createContactRoute,
  updateContactRoute,
  deleteContactRoute,
  bulkUpdateRoute,
  linkContactRoute,
  linkCreateRoute,
  unlinkContactRoute,
  mergeContactRoute,
  mapContactsRoute,
  exportContactsRoute,
  uploadPhotoRoute,
  deletePhotoRoute,
} from "./routes/contacts.js";
import { listTags, createTag, updateTag, deleteTag, exportTags } from "./routes/tags.js";
import { schemaContacts, schemaAddresses, schemaTags } from "./routes/schema.js";

const app = express();
const jsonParser = express.json();
const jsonParserLarge = express.json({ limit: "10mb" });

// ── New unified API routes ──────────────────────────────────────────

// Auth
app.post("/api/auth/login", handleAuth);
// Keep legacy endpoint for backward compat during migration
app.post("/api/server/auth", handleAuth);

// Schema
app.get("/api/schema/contacts", schemaContacts);
app.get("/api/schema/addresses", schemaAddresses);
app.get("/api/schema/tags", schemaTags);

// Contacts (must register /export, /map, /bulk before /:id)
app.get("/api/contacts/export", exportContactsRoute);
app.get("/api/contacts/map", mapContactsRoute);
app.post("/api/contacts/bulk", jsonParser, bulkUpdateRoute);
app.get("/api/contacts", listContactsRoute);
app.get("/api/contacts/:id", getContactRoute);
app.post("/api/contacts", jsonParser, createContactRoute);
app.patch("/api/contacts/:id", jsonParser, updateContactRoute);
app.delete("/api/contacts/:id", deleteContactRoute);

// Contact linking
app.post("/api/contacts/:id/link", jsonParser, linkContactRoute);
app.post("/api/contacts/:id/link/create", jsonParser, linkCreateRoute);
app.delete("/api/contacts/:id/link", unlinkContactRoute);
app.post("/api/contacts/:id/merge", jsonParser, mergeContactRoute);
app.post("/api/contacts/:id/photo", jsonParserLarge, uploadPhotoRoute);
app.delete("/api/contacts/:id/photo", deletePhotoRoute);

// Addresses (must register /export and /rehydrate before /:id)
app.get("/api/addresses/export", exportAddresses);
app.post("/api/addresses/rehydrate", rehydrateAddresses);
app.get("/api/addresses", listAddresses);
app.get("/api/addresses/:id", getAddress);
app.post("/api/addresses", jsonParser, createAddress);
app.patch("/api/addresses/:id", jsonParser, updateAddress);
app.delete("/api/addresses/:id", deleteAddress);
app.post("/api/addresses/:id/rehydrate", rehydrateOne);

// Tags (must register /export before /:id)
app.get("/api/tags/export", exportTags);
app.get("/api/tags", listTags);
app.post("/api/tags", jsonParser, createTag);
app.patch("/api/tags/:id", jsonParser, updateTag);
app.delete("/api/tags/:id", deleteTag);

// Geocode
app.get("/api/geocode", handleGeocode);

// CardDAV
app.get("/api/carddav/address-books", getAddressBooks);
app.get("/api/carddav/contacts", getContacts);
app.get("/api/carddav/links", getLinks);
app.post("/api/carddav/links", jsonParser, createLink);
app.delete("/api/carddav/links/:pbId", deleteLink);
app.post("/api/carddav/sync", jsonParserLarge, syncToRadicale);
app.post("/api/carddav/contacts", jsonParser, createContact);
app.delete("/api/carddav/contacts", jsonParser, deleteContact);



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
