import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";
import ContactDetail from "./ContactDetail.tsx";

interface Record {
  id: string;
  [key: string]: unknown;
}

interface MapContact {
  contact: Record;
  lat: number;
  lon: number;
  label: string;
  address: string;
}

function contactLabel(c: Record): string {
  return [c.first_name ?? c.name ?? "", c.last_name ?? ""]
    .map(String).filter(Boolean).join(" ") || String(c.id);
}

function buildAddressLabel(addr: Record): string {
  return ["address_street", "address_city", "address_state", "address_zip", "address_country"]
    .map((k) => String(addr[k] ?? "")).filter(Boolean).join(", ");
}

export default function MapPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<MapContact[]>([]);
  const [unmapped, setUnmapped] = useState(0);
  const [selected, setSelected] = useState<Record | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current).setView([39.8283, -98.5795], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    leafletMap.current = map;
    return () => { map.remove(); leafletMap.current = null; };
  }, []);

  // Fetch all contacts, read lat/lon from expanded address
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAuthenticated();
        const items = await pb.collection("contacts").getFullList<Record>({
          expand: "current_address",
        });

        const pins: MapContact[] = [];
        let noCoords = 0;

        for (const c of items) {
          const expand = (c as Record).expand as globalThis.Record<string, globalThis.Record<string, unknown>> | undefined;
          const addr = expand?.current_address;
          if (!addr || typeof addr !== "object") { noCoords++; continue; }

          const lat = Number(addr.latitude);
          const lon = Number(addr.longitude);
          if (!lat && !lon) { noCoords++; continue; }

          pins.push({
            contact: c,
            lat,
            lon,
            label: contactLabel(c),
            address: buildAddressLabel(addr as Record),
          });
        }

        if (!cancelled) {
          setMapped(pins);
          setUnmapped(noCoords);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load contacts");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Update markers
  useEffect(() => {
    if (!leafletMap.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    for (const pin of mapped) {
      const marker = L.marker([pin.lat, pin.lon])
        .bindPopup(`<b>${pin.label}</b><br/>${pin.address}`)
        .on("click", () => setSelected(pin.contact));
      markersRef.current.addLayer(marker);
    }

    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map((p) => [p.lat, p.lon]));
      leafletMap.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [mapped]);

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {loading && (
        <div className="mb-3 flex items-center gap-3 text-sm text-text-secondary">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading contacts…
        </div>
      )}

      <div
        ref={mapRef}
        className="h-[calc(100vh-220px)] w-full rounded-lg border border-border"
        style={{ minHeight: "400px", zIndex: 0 }}
      />

      <div className="mt-2 text-xs text-text-muted">
        {mapped.length} contact{mapped.length !== 1 ? "s" : ""} mapped
        {unmapped > 0 && ` · ${unmapped} without coordinates (edit address to geocode)`}
      </div>

      {selected && (
        <ContactDetail
          contact={selected}
          fields={[]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
