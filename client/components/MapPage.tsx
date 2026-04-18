import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { contacts as contactsApi, type MapPin } from "../lib/api.ts";

interface Props {
  onContactSelect: (contactId: string) => void;
  onAddressSelect: (addressId: string) => void;
}

export default function MapPage({ onContactSelect, onAddressSelect }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapped, setMapped] = useState<MapPin[]>([]);
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

  // Update markers — use a ref to the click handler so popups can call it
  const onContactSelectRef = useRef(onContactSelect);
  onContactSelectRef.current = onContactSelect;
  const onAddressSelectRef = useRef(onAddressSelect);
  onAddressSelectRef.current = onAddressSelect;

  useEffect(() => {
    if (!leafletMap.current || !markersRef.current) return;
    markersRef.current.clearLayers();

    // Expose global handlers that popup links can call
    (window as unknown as Record<string, unknown>).__mapResidentClick = (id: string) => {
      onContactSelectRef.current(id);
    };
    (window as unknown as Record<string, unknown>).__mapAddressClick = (id: string) => {
      onAddressSelectRef.current(id);
    };

    for (const pin of mapped) {
      const residentLinks = pin.residents
        .map((r) => `<a href="#" onclick="event.preventDefault();window.__mapResidentClick('${r.id}')" style="color:var(--color-primary, #3b82f6);text-decoration:underline;cursor:pointer">${escapeHtml(r.name)}</a>`)
        .join("<br/>");

      const popupHtml = `<div style="font-size:13px;line-height:1.5">
        <div style="font-weight:600;margin-bottom:4px">Residents</div>
        ${residentLinks}
        <div style="margin-top:6px;font-size:11px"><a href="#" onclick="event.preventDefault();window.__mapAddressClick('${pin.addressId}')" style="color:#888;text-decoration:underline;text-decoration-color:rgba(136,136,136,0.3);cursor:pointer">${escapeHtml(pin.address)}</a></div>
      </div>`;

      const marker = L.marker([pin.lat, pin.lon]).bindPopup(popupHtml);
      markersRef.current.addLayer(marker);
    }

    if (mapped.length > 0) {
      const bounds = L.latLngBounds(mapped.map((p) => [p.lat, p.lon]));
      leafletMap.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }

    return () => {
      delete (window as unknown as Record<string, unknown>).__mapResidentClick;
      delete (window as unknown as Record<string, unknown>).__mapAddressClick;
    };
  }, [mapped]);

  // Count total residents across all pins
  const totalResidents = mapped.reduce((sum, p) => sum + p.residents.length, 0);

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
        {totalResidents} contact{totalResidents !== 1 ? "s" : ""} across {mapped.length} address{mapped.length !== 1 ? "es" : ""} mapped
      </div>

    </>
  );
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
