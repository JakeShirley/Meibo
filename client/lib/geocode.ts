interface GeoResult {
  lat: number;
  lon: number;
  display_name: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  if (!address.trim()) return null;
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
