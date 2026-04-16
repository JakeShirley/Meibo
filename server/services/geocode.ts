import { config } from "../config.js";

const MAPBOX_URL = "https://api.mapbox.com/search/geocode/v6/forward";

export interface GeoResult {
  lat: number;
  lon: number;
  display_name: string;
  match_code?: {
    confidence: string;
    address_number?: string;
    street?: string;
    postcode?: string;
    place?: string;
    region?: string;
    country?: string;
    [key: string]: string | undefined;
  };
  suggested_address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    full: string;
  };
}

export async function geocodeAddress(address: string): Promise<GeoResult | null> {
  if (!address.trim()) return null;

  const token = config.mapboxToken;
  if (!token) {
    console.error("[Geocode] MAPBOX_ACCESS_TOKEN not configured");
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: address,
      access_token: token,
      limit: "1",
    });
    const url = `${MAPBOX_URL}?${params}`;
    console.log(`[Geocode] Request: ${url.replace(token, "***")}`);

    const res = await fetch(url);
    console.log(`[Geocode] Response: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Geocode] HTTP error ${res.status} for "${address}": ${body}`);
      return null;
    }

    const data = await res.json();
    const features = data.features;

    if (!features || features.length === 0) {
      console.log(`[Geocode] No results for "${address}"`);
      return null;
    }

    const feature = features[0];
    const [lon, lat] = feature.geometry.coordinates;
    const props = feature.properties;
    const display_name = props.full_address || props.name || address;
    const match_code = props.match_code || undefined;
    const context = props.context || {};

    const suggested_address = {
      street: [context.address?.address_number, context.address?.street_name].filter(Boolean).join(" ") || "",
      city: context.place?.name || "",
      state: context.region?.region_code || context.region?.name || "",
      zip: context.postcode?.name || "",
      country: context.country?.name || "",
      full: display_name,
    };

    console.log(`[Geocode] Found: ${display_name} (${lat}, ${lon}) confidence=${match_code?.confidence || "n/a"}`);
    return { lat, lon, display_name, match_code, suggested_address };
  } catch (err) {
    console.error(`[Geocode] Exception for "${address}":`, err);
    return null;
  }
}
