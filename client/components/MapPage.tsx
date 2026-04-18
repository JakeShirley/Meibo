import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { contacts as contactsApi, type MapPin } from "../lib/api.ts";
import ContactDetail from "./ContactDetail.tsx";

interface Record {
  id: string;
  [key: string]: unknown;
}

export default function MapPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<MapPin[]>([]);
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

  // Fetch map pins from new API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pins = await contactsApi.map();
        if (!cancelled) {
          setMapped(pins);
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
        .bindPopup(`<b>${pin.name}</b><br/>${pin.address}`)
        .on("click", () => setSelected({ id: pin.id, name: pin.name } as Record));
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
