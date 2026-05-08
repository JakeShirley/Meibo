import { geocode } from "./api.ts";

interface GeoResult {
  lat: number;
  lon: number;
  display_name: string;
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  if (!address.trim()) return null;
  try {
    return await geocode.forward(address);
  } catch {
    return null;
  }
}
