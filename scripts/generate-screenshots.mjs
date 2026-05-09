import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "docs", "screenshots");

const createdAt = "2026-05-08T12:00:00.000Z";
const updatedAt = "2026-05-08T12:00:00.000Z";

const tags = [
  { id: "tag_family", name: "Family" },
  { id: "tag_neighbors", name: "Neighbors" },
  { id: "tag_holiday", name: "Holiday Cards" },
  { id: "tag_work", name: "Work" },
];

const addresses = [
  {
    id: "addr_portland",
    address_street: "214 Maple Street",
    city: "Portland",
    state: "OR",
    zip: "97205",
    country: "USA",
    latitude: 45.5152,
    longitude: -122.6784,
    "contact_residents._resolved": [
      { id: "contact_avery", label: "Avery Chen" },
      { id: "contact_mina", label: "Mina Patel" },
    ],
    created: createdAt,
    updated: updatedAt,
  },
  {
    id: "addr_austin",
    address_street: "88 Barton Creek Road",
    city: "Austin",
    state: "TX",
    zip: "78704",
    country: "USA",
    latitude: 30.2672,
    longitude: -97.7431,
    "contact_residents._resolved": [
      { id: "contact_jordan", label: "Jordan Brooks" },
    ],
    created: createdAt,
    updated: updatedAt,
  },
  {
    id: "addr_chicago",
    address_street: "1518 W Oak Avenue",
    city: "Chicago",
    state: "IL",
    zip: "60614",
    country: "USA",
    latitude: 41.8781,
    longitude: -87.6298,
    "contact_residents._resolved": [
      { id: "contact_elena", label: "Elena Rivera" },
    ],
    created: createdAt,
    updated: updatedAt,
  },
  {
    id: "addr_denver",
    address_street: "700 Spruce Lane",
    city: "Denver",
    state: "CO",
    zip: "80203",
    country: "USA",
    latitude: 39.7392,
    longitude: -104.9903,
    "contact_residents._resolved": [
      { id: "contact_noah", label: "Noah Williams" },
    ],
    created: createdAt,
    updated: updatedAt,
  },
  {
    id: "addr_boston",
    address_street: "12 Acorn Court",
    city: "Boston",
    state: "MA",
    zip: "02108",
    country: "USA",
    latitude: 42.3601,
    longitude: -71.0589,
    "contact_residents._resolved": [
      { id: "contact_sam", label: "Sam Morgan" },
      { id: "contact_taylor", label: "Taylor Morgan" },
    ],
    created: createdAt,
    updated: updatedAt,
  },
];

const contacts = [
  makeContact({
    id: "contact_avery",
    firstName: "Avery",
    lastName: "Chen",
    email: "avery.chen@example.com",
    phone: "(555) 013-0147",
    birthday: "1986-04-18",
    addressId: "addr_portland",
    tagIds: ["tag_family", "tag_holiday"],
    linked: true,
  }),
  makeContact({
    id: "contact_mina",
    firstName: "Mina",
    lastName: "Patel",
    email: "mina.patel@example.com",
    phone: "(555) 013-0199",
    birthday: "1990-11-02",
    addressId: "addr_portland",
    tagIds: ["tag_family"],
    linked: true,
  }),
  makeContact({
    id: "contact_jordan",
    firstName: "Jordan",
    lastName: "Brooks",
    email: "jordan.brooks@example.com",
    phone: "(555) 018-2244",
    birthday: "1979-08-27",
    addressId: "addr_austin",
    tagIds: ["tag_neighbors"],
    linked: false,
  }),
  makeContact({
    id: "contact_elena",
    firstName: "Elena",
    lastName: "Rivera",
    email: "elena.rivera@example.com",
    phone: "(555) 017-2045",
    birthday: "1994-02-14",
    addressId: "addr_chicago",
    tagIds: ["tag_work", "tag_holiday"],
    linked: true,
  }),
  makeContact({
    id: "contact_noah",
    firstName: "Noah",
    lastName: "Williams",
    email: "noah.williams@example.com",
    phone: "(555) 011-3388",
    birthday: "1983-06-05",
    addressId: "addr_denver",
    tagIds: ["tag_neighbors"],
    linked: false,
  }),
  makeContact({
    id: "contact_sam",
    firstName: "Sam",
    lastName: "Morgan",
    email: "sam.morgan@example.com",
    phone: "(555) 015-9021",
    birthday: "1992-12-10",
    addressId: "addr_boston",
    tagIds: ["tag_family", "tag_holiday"],
    linked: true,
  }),
  makeContact({
    id: "contact_taylor",
    firstName: "Taylor",
    lastName: "Morgan",
    email: "taylor.morgan@example.com",
    phone: "(555) 015-9022",
    birthday: "1991-09-21",
    addressId: "addr_boston",
    tagIds: ["tag_family"],
    linked: false,
  }),
];

const carddavContacts = contacts.slice(0, 5).map((contactRecord) => ({
  uid: `${contactRecord.id}@demo`,
  href: `/addressbooks/users/contacts/${contactRecord.id}.vcf`,
  etag: `"${contactRecord.id}-etag"`,
  fn: `${contactRecord.first_name} ${contactRecord.last_name}`,
  email: String(contactRecord.email),
  tel: String(contactRecord.phone_number),
  org: contactRecord._linked ? "Personal" : "Imported",
  photoUri: "",
  adrStreet: String(contactRecord["current_address.address_street"] ?? ""),
  adrCity: String(contactRecord["current_address.city"] ?? ""),
  adrState: String(contactRecord["current_address.state"] ?? ""),
  adrZip: String(contactRecord["current_address.zip"] ?? ""),
  adrCountry: String(contactRecord["current_address.country"] ?? ""),
  bdayYear: Number(String(contactRecord.birthday).slice(0, 4)),
  bdayMonth: Number(String(contactRecord.birthday).slice(5, 7)),
  bdayDay: Number(String(contactRecord.birthday).slice(8, 10)),
  raw: [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${contactRecord.first_name} ${contactRecord.last_name}`,
    `EMAIL:${contactRecord.email}`,
    `TEL:${contactRecord.phone_number}`,
    "END:VCARD",
  ].join("\n"),
}));

const links = Object.fromEntries(
  carddavContacts
    .filter((carddavContact) => contacts.find((contactRecord) => contactRecord.id === carddavContact.uid.replace("@demo", ""))?._linked)
    .map((carddavContact) => [carddavContact.uid.replace("@demo", ""), carddavContact.href]),
);

const schemas = {
  contacts: [
    { name: "first_name", type: "text", required: true },
    { name: "last_name", type: "text", required: true },
    { name: "email", type: "email", required: false },
    { name: "phone_number", type: "text", required: false },
    { name: "current_address", type: "relation", required: false },
    { name: "group_tag", type: "relation", required: false },
    { name: "birthday", type: "date", required: false },
  ],
  addresses: [
    { name: "address_street", type: "text", required: true },
    { name: "city", type: "text", required: true },
    { name: "state", type: "text", required: false },
    { name: "zip", type: "text", required: false },
    { name: "country", type: "text", required: false },
    { name: "contact_residents", type: "relation", required: false },
  ],
  tags: [
    { name: "name", type: "text", required: true },
  ],
};

const mapPins = addresses.map((addressRecord) => ({
  lat: Number(addressRecord.latitude),
  lon: Number(addressRecord.longitude),
  address: [
    addressRecord.address_street,
    addressRecord.city,
    addressRecord.state,
    addressRecord.zip,
  ].filter(Boolean).join(", "),
  addressId: addressRecord.id,
  residents: addressRecord["contact_residents._resolved"].map((resident) => ({
    id: resident.id,
    name: resident.label,
  })),
}));

const screenshots = [
  {
    hash: "#contacts",
    fileName: "contacts.png",
    waitFor: async (page) => {
      await page.getByText("avery.chen@example.com").first().waitFor({ timeout: 10000 });
    },
  },
  {
    hash: "#export",
    fileName: "export.png",
    waitFor: async (page) => {
      await page.getByText("Export Contacts").first().waitFor({ timeout: 10000 });
    },
  },
];

function makeContact({ id, firstName, lastName, email, phone, birthday, addressId, tagIds, linked }) {
  const addressRecord = addresses.find((candidateAddress) => candidateAddress.id === addressId);
  const tagNames = tagIds
    .map((tagId) => tags.find((tagRecord) => tagRecord.id === tagId)?.name)
    .filter(Boolean)
    .join(", ");

  return {
    id,
    first_name: firstName,
    last_name: lastName,
    email,
    phone_number: phone,
    birthday,
    current_address: addressId,
    group_tag: tagIds,
    "group_tag.name": tagNames,
    "current_address.address_street": addressRecord?.address_street ?? "",
    "current_address.city": addressRecord?.city ?? "",
    "current_address.state": addressRecord?.state ?? "",
    "current_address.zip": addressRecord?.zip ?? "",
    "current_address.country": addressRecord?.country ?? "",
    "current_address.latitude": addressRecord?.latitude ?? 0,
    "current_address.longitude": addressRecord?.longitude ?? 0,
    latitude: addressRecord?.latitude ?? 0,
    longitude: addressRecord?.longitude ?? 0,
    created: createdAt,
    updated: updatedAt,
    _linked: linked,
  };
}

function makePage(items, url) {
  const pageNumber = Number(url.searchParams.get("page") ?? "1");
  const perPage = Number(url.searchParams.get("perPage") ?? "25");
  const sort = url.searchParams.get("sort") ?? "";
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();
  const filter = url.searchParams.get("filter") ?? "";

  let filteredItems = [...items];

  if (filter) {
    const tagIds = [...filter.matchAll(/group_tag\s*~\s*"([^"]+)"/g)].map((match) => match[1]);
    if (tagIds.length > 0) {
      filteredItems = filteredItems.filter((item) => {
        const itemTagIds = Array.isArray(item.group_tag) ? item.group_tag : [];
        return tagIds.some((tagId) => itemTagIds.includes(tagId));
      });
    }
  }

  if (search) {
    filteredItems = filteredItems.filter((item) =>
      Object.values(item).some((value) => String(value).toLowerCase().includes(search)),
    );
  }

  if (sort) {
    const descending = sort.startsWith("-");
    const sortField = descending ? sort.slice(1) : sort;
    filteredItems.sort((leftItem, rightItem) => {
      const leftValue = String(leftItem[sortField] ?? "").toLowerCase();
      const rightValue = String(rightItem[sortField] ?? "").toLowerCase();
      const comparison = leftValue.localeCompare(rightValue);
      return descending ? -comparison : comparison;
    });
  }

  const start = (pageNumber - 1) * perPage;
  const pagedItems = filteredItems.slice(start, start + perPage);

  return {
    items: pagedItems,
    page: pageNumber,
    perPage,
    totalItems: filteredItems.length,
    totalPages: Math.max(1, Math.ceil(filteredItems.length / perPage)),
  };
}

async function fulfillJson(route, body, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function fulfillTile(route) {
  const tileSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#eef2f7"/><path d="M-20 224 C52 190 86 203 152 168 C202 141 225 120 276 119" fill="none" stroke="#cbd5e1" stroke-width="9"/><path d="M29 -22 C58 62 91 88 168 107 C217 119 238 146 274 199" fill="none" stroke="#d7e3ef" stroke-width="6"/><path d="M0 84 H256 M0 172 H256 M84 0 V256 M172 0 V256" stroke="#dbe4ee" stroke-width="1"/><circle cx="68" cy="140" r="3" fill="#94a3b8"/><circle cx="190" cy="70" r="3" fill="#94a3b8"/></svg>`;
  await route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: tileSvg,
  });
}

async function handleApi(route) {
  const request = route.request();
  const url = new URL(request.url());
  const pathName = url.pathname;

  if (pathName === "/api/auth/login" && request.method() === "POST") {
    return fulfillJson(route, { authEnabled: false, authenticated: true });
  }

  if (pathName === "/api/schema/contacts") return fulfillJson(route, { fields: schemas.contacts });
  if (pathName === "/api/schema/addresses") return fulfillJson(route, { fields: schemas.addresses });
  if (pathName === "/api/schema/tags") return fulfillJson(route, { fields: schemas.tags });
  if (pathName === "/api/contacts/map") return fulfillJson(route, mapPins);
  if (pathName === "/api/contacts") return fulfillJson(route, makePage(contacts, url));
  if (pathName.startsWith("/api/contacts/")) {
    const contactId = decodeURIComponent(pathName.split("/").pop() ?? "");
    const contactRecord = contacts.find((candidateContact) => candidateContact.id === contactId);
    return fulfillJson(route, contactRecord ?? { error: "Contact not found" }, contactRecord ? 200 : 404);
  }
  if (pathName === "/api/addresses") return fulfillJson(route, makePage(addresses, url));
  if (pathName.startsWith("/api/addresses/")) {
    const addressId = decodeURIComponent(pathName.split("/").pop() ?? "");
    const addressRecord = addresses.find((candidateAddress) => candidateAddress.id === addressId);
    return fulfillJson(route, addressRecord ?? { error: "Address not found" }, addressRecord ? 200 : 404);
  }
  if (pathName === "/api/tags") return fulfillJson(route, makePage(tags, url));
  if (pathName === "/api/carddav/address-books") {
    return fulfillJson(route, [
      { href: "/addressbooks/users/contacts/", displayName: "Personal Contacts" },
      { href: "/addressbooks/users/holiday/", displayName: "Holiday Cards" },
    ]);
  }
  if (pathName === "/api/carddav/contacts") return fulfillJson(route, carddavContacts);
  if (pathName === "/api/carddav/links") return fulfillJson(route, links);

  return fulfillJson(route, { error: `No screenshot fixture for ${pathName}` }, 404);
}

async function captureScreenshots(baseUrl) {
  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      window.localStorage.setItem("theme", "default");
    });
    await context.route("**/api/**", handleApi);
    await context.route("https://*.tile.openstreetmap.org/**", fulfillTile);

    const page = await context.newPage();
    page.on("pageerror", (error) => {
      console.error(`[browser error] ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      console.error(`[request failed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        console.error(`[browser ${message.type()}] ${message.text()}`);
      }
    });

    for (const screenshot of screenshots) {
      try {
        await page.goto(`${baseUrl}${screenshot.hash}`, { waitUntil: "domcontentloaded" });
        await screenshot.waitFor(page);
        const outputPath = path.join(outputDir, screenshot.fileName);
        await page.screenshot({
          path: outputPath,
          fullPage: false,
          animations: "disabled",
        });
        console.log(`Wrote ${path.relative(projectRoot, outputPath)}`);
      } catch (error) {
        const debugPath = path.join(outputDir, `debug-${screenshot.fileName}`);
        await page.screenshot({ path: debugPath, fullPage: false }).catch(() => {});
        console.error(`Failed while capturing ${screenshot.fileName}. Debug screenshot: ${path.relative(projectRoot, debugPath)}`);
        throw error;
      }
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const server = await createServer({
    configFile: path.join(projectRoot, "vite.config.ts"),
    root: projectRoot,
    logLevel: "error",
    server: {
      host: "127.0.0.1",
      port: 4174,
      strictPort: false,
    },
  });

  try {
    await server.listen();
    const baseUrl = server.resolvedUrls?.local[0] ?? "http://127.0.0.1:4174/";
    await captureScreenshots(baseUrl);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});