/**
 * Migration: Factor out `family_side` text field into a `family_relations` collection
 * and convert the contacts field to a relation.
 *
 * Steps:
 * 1. Authenticate as admin
 * 2. Read all unique family_side values from contacts
 * 3. Create the `family_relations` collection with a `name` field
 * 4. Insert a record for each unique family side
 * 5. Add a `family_relation` relation field to contacts
 * 6. Update every contact to point to the matching family_relations record
 * 7. Remove the old `family_side` text field from contacts
 */

const PB_URL = process.env.VITE_POCKETBASE_URL || "http://10.1.0.50:5170";
const ADMIN_EMAIL = process.env.VITE_PB_ADMIN_EMAIL || "navi@odinseye.org";
const ADMIN_PASSWORD = process.env.VITE_PB_ADMIN_PASSWORD || "gprWWsDrEy6ocVCra7u3";

let token = "";

async function pb(path, options = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`[${res.status}] ${options.method || "GET"} ${path}:`, JSON.stringify(data, null, 2));
    throw new Error(`PB API error ${res.status}: ${path}`);
  }
  return data;
}

async function authenticate() {
  // Try legacy admin auth first
  try {
    const data = await pb("/api/admins/auth-with-password", {
      method: "POST",
      body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    token = data.token;
    console.log("Authenticated via legacy admin endpoint");
    return;
  } catch {
    // Try new _superusers endpoint
  }
  const data = await pb("/api/collections/_superusers/records/auth-with-password", {
    method: "POST",
    body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  token = data.token;
  console.log("Authenticated via _superusers endpoint");
}

async function getAllContacts() {
  const all = [];
  let page = 1;
  while (true) {
    const res = await pb(`/api/collections/contacts/records?perPage=200&page=${page}`);
    all.push(...res.items);
    if (page >= res.totalPages) break;
    page++;
  }
  return all;
}

async function run() {
  console.log("=== Migration: family_side -> family_relations ===\n");

  // 1. Auth
  await authenticate();

  // 2. Get all contacts and extract unique family sides
  console.log("Fetching all contacts...");
  const contacts = await getAllContacts();
  console.log(`Found ${contacts.length} contacts`);

  const uniqueSides = [...new Set(
    contacts
      .map((c) => (c.family_side || "").trim())
      .filter(Boolean)
  )].sort();
  console.log(`Unique family sides: ${uniqueSides.join(", ")}`);

  if (uniqueSides.length === 0) {
    console.log("No family sides found, nothing to migrate.");
    return;
  }

  // 3. Create family_relations collection
  console.log("\nCreating family_relations collection...");
  let collection;
  try {
    collection = await pb("/api/collections", {
      method: "POST",
      body: {
        name: "family_relations",
        type: "base",
        schema: [
          {
            name: "name",
            type: "text",
            required: true,
            options: { min: 1, max: 100 },
          },
        ],
        listRule: "",
        viewRule: "",
        createRule: null,
        updateRule: null,
        deleteRule: null,
      },
    });
    console.log(`Created collection: ${collection.id}`);
  } catch (err) {
    // Collection might already exist
    console.log("Collection may already exist, trying to fetch it...");
    collection = await pb("/api/collections/family_relations");
    console.log(`Found existing collection: ${collection.id}`);
  }

  // 4. Insert records for each unique family side
  console.log("\nInserting family relation records...");
  const sideToId = new Map();
  for (const side of uniqueSides) {
    try {
      const record = await pb("/api/collections/family_relations/records", {
        method: "POST",
        body: { name: side },
      });
      sideToId.set(side, record.id);
      console.log(`  Created "${side}" -> ${record.id}`);
    } catch {
      // Might already exist, try to find it
      const existing = await pb(
        `/api/collections/family_relations/records?filter=name="${encodeURIComponent(side)}"`
      );
      if (existing.items.length > 0) {
        sideToId.set(side, existing.items[0].id);
        console.log(`  Found existing "${side}" -> ${existing.items[0].id}`);
      } else {
        console.error(`  Failed to create or find "${side}"`);
      }
    }
  }

  // 5. Add family_relation field to contacts collection
  console.log("\nAdding family_relation field to contacts...");
  const contactsCol = await pb("/api/collections/contacts");
  const existingSchema = contactsCol.schema || [];

  // Check if field already exists
  const hasNewField = existingSchema.some((f) => f.name === "family_relation");
  if (!hasNewField) {
    const updatedSchema = [
      ...existingSchema,
      {
        name: "family_relation",
        type: "relation",
        required: false,
        options: {
          collectionId: collection.id,
          cascadeDelete: false,
          maxSelect: 1,
          minSelect: null,
        },
      },
    ];
    await pb(`/api/collections/contacts`, {
      method: "PATCH",
      body: { schema: updatedSchema },
    });
    console.log("Added family_relation field");
  } else {
    console.log("family_relation field already exists");
  }

  // 6. Update each contact to set the relation
  console.log("\nUpdating contacts with family_relation...");
  let updated = 0;
  let skipped = 0;
  for (const contact of contacts) {
    const side = (contact.family_side || "").trim();
    const relationId = sideToId.get(side);
    if (!relationId) {
      skipped++;
      continue;
    }
    try {
      await pb(`/api/collections/contacts/records/${contact.id}`, {
        method: "PATCH",
        body: { family_relation: relationId },
      });
      updated++;
    } catch (err) {
      console.error(`  Failed to update contact ${contact.id} (${contact.first_name} ${contact.last_name}):`, err.message);
    }
  }
  console.log(`Updated ${updated} contacts, skipped ${skipped} (no family side)`);

  // 7. Remove old family_side field
  console.log("\nRemoving old family_side text field...");
  const finalCol = await pb("/api/collections/contacts");
  const cleanedSchema = (finalCol.schema || []).filter((f) => f.name !== "family_side");
  if (cleanedSchema.length !== (finalCol.schema || []).length) {
    await pb(`/api/collections/contacts`, {
      method: "PATCH",
      body: { schema: cleanedSchema },
    });
    console.log("Removed family_side field");
  } else {
    console.log("family_side field already removed");
  }

  console.log("\n=== Migration complete! ===");
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
