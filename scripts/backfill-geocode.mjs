/**
 * Backfill: Geocode all existing contact_addresses that don't have lat/lon.
 */

const PB_URL = process.env.VITE_POCKETBASE_URL || "http://10.1.0.50:5170";
const ADMIN_EMAIL = process.env.VITE_PB_ADMIN_EMAIL || "navi@odinseye.org";
const ADMIN_PASSWORD = process.env.VITE_PB_ADMIN_PASSWORD || "gprWWsDrEy6ocVCra7u3";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

let token = "";

async function pb(path, options = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`PB ${res.status}: ${path} - ${JSON.stringify(data)}`);
  return data;
}

async function geocode(address) {
  const params = new URLSearchParams({ q: address, format: "json", limit: "1" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { "User-Agent": "ContactBookBackfill/1.0" },
    });
    if (res.status === 429) {
      console.log(`    Rate limited, waiting ${10 + attempt * 10}s...`);
      await sleep((10 + attempt * 10) * 1000);
      continue;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log("=== Backfill: Geocode existing addresses ===\n");

  // Auth
  const auth = await pb("/api/admins/auth-with-password", {
    method: "POST", body: { identity: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  token = auth.token;

  // Get all addresses
  let page = 1;
  const all = [];
  while (true) {
    const res = await pb(`/api/collections/contact_addresses/records?perPage=200&page=${page}`);
    all.push(...res.items);
    if (page >= res.totalPages) break;
    page++;
  }
  console.log(`Found ${all.length} addresses`);

  const toGeocode = all.filter(a => !a.latitude && !a.longitude);
  console.log(`${toGeocode.length} need geocoding\n`);

  let success = 0, failed = 0;
  for (const addr of toGeocode) {
    const parts = [addr.address_street, addr.address_city, addr.address_state, addr.address_zip, addr.address_country]
      .filter(Boolean).join(", ");
    if (!parts) { failed++; continue; }

    await sleep(2000); // Nominatim rate limit: 1 req/sec, use 2s to be safe
    const geo = await geocode(parts);
    if (geo) {
      await pb(`/api/collections/contact_addresses/records/${addr.id}`, {
        method: "PATCH",
        body: { latitude: geo.lat, longitude: geo.lon },
      });
      success++;
      console.log(`  ✓ ${parts} → ${geo.lat}, ${geo.lon}`);
    } else {
      failed++;
      console.log(`  ✗ ${parts} — not found`);
    }
  }

  console.log(`\nDone: ${success} geocoded, ${failed} failed, ${all.length - toGeocode.length} already had coordinates`);
}

run().catch(e => { console.error(e); process.exit(1); });
