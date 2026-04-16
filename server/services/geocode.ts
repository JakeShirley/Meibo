const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

interface GeoResult {
  lat: number;
  lon: number;
  display_name: string;
}

// Rate-limit: max 1 req/sec for Nominatim
let lastRequest = 0;

async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, 1500 - (now - lastRequest));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  if (!address.trim()) return null;
  await throttle();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const params = new URLSearchParams({ q: address, format: "json", limit: "1" });
      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        headers: { "User-Agent": "ContactBook/1.0 (server)" },
      });
      if (res.status === 429) {
        const wait = (10 + attempt * 15) * 1000;
        console.log(`[Geocode] Rate limited, waiting ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      if (data.length === 0) return null;
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name,
      };
    } catch {
      return null;
    }
  }
  return null;
}
