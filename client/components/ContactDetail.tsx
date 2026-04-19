import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Contact } from "../types/contact.ts";
import { contacts as contactsApi } from "../lib/api.ts";

// Fix Leaflet marker icon with bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface SchemaField {
  name: string;
  type: string;
}

interface Props {
  contact: Contact;
  fields: SchemaField[];
  onClose: () => void;
  onEdit?: () => void;
  onRehydrate?: () => void;
  rehydrating?: boolean;
  photoUri?: string;
  isLinked?: boolean;
  onLinkCardDav?: () => void;
  onAddressClick?: (addressId: string) => void;
  onContactClick?: (contactId: string) => void;
  onPhotoChange?: (photoUri: string) => void;
}

const LABEL_OVERRIDES: Record<string, string> = {
  group_tag: "Group Tags",
};

function toLabel(name: string): string {
  if (LABEL_OVERRIDES[name]) return LABEL_OVERRIDES[name];
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ContactDetail({ contact, fields, onClose, onEdit, onRehydrate, rehydrating, photoUri, isLinked, onLinkCardDav, onAddressClick, onContactClick, onPhotoChange }: Props) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState(photoUri);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setCurrentPhoto(photoUri); }, [photoUri]);

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) return;
    if (file.size > 3 * 1024 * 1024) return; // 3MB limit

    setUploadingPhoto(true);
    try {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:...;base64, prefix
        };
        reader.readAsDataURL(file);
      });
      const { photoUri: newUri } = await contactsApi.uploadPhoto(contact.id, base64, file.type);
      setCurrentPhoto(newUri);
      onPhotoChange?.(newUri);
    } catch (err) {
      console.error("Photo upload failed:", err);
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePhotoClear = async () => {
    setUploadingPhoto(true);
    try {
      await contactsApi.deletePhoto(contact.id);
      setCurrentPhoto(undefined);
      onPhotoChange?.("");
    } catch (err) {
      console.error("Photo clear failed:", err);
    } finally {
      setUploadingPhoto(false);
    }
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Expand relation_composed fields into sub-fields from the contact data
  const SKIP_KEYS = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand",
    "_linked", "_photoUri", "_carddavHref"]);
  const SKIP_SUB_KEYS = new Set(["latitude", "longitude", "_resolved"]);

  const expandedFields: { key: string; label: string; type?: string }[] = [];
  if (fields.length > 0) {
    for (const f of fields) {
      if (f.type === "relation_composed") {
        // Find dot-notation sub-fields in the contact data for this relation
        const prefix = `${f.name}.`;
        const subKeys = Object.keys(contact).filter(
          (k) => k.startsWith(prefix) && !SKIP_SUB_KEYS.has(k.slice(prefix.length)),
        );
        if (subKeys.length === 1) {
            // Single sub-field (e.g. group_tag.name) — use the relation's own label
            expandedFields.push({ key: subKeys[0], label: toLabel(f.name), type: f.name === "current_address" ? "address_sub" : undefined });
          } else if (subKeys.length > 1) {
          for (const k of subKeys) {
            expandedFields.push({ key: k, label: toLabel(k.slice(prefix.length)), type: f.name === "current_address" ? "address_sub" : undefined });
          }
        } else {
          // No expanded sub-fields — show the raw relation ID
          expandedFields.push({ key: f.name, label: toLabel(f.name) });
        }
      } else {
        expandedFields.push({ key: f.name, label: toLabel(f.name) });
      }
    }
  } else {
    for (const k of Object.keys(contact)) {
      if (!SKIP_KEYS.has(k)) expandedFields.push({ key: k, label: toLabel(k) });
    }
  }

  // Separate address fields from other fields
  const addressSubFields = expandedFields.filter((f) => f.type === "address_sub");
  const nonAddressFields = expandedFields.filter((f) => f.type !== "address_sub");

  // Build a combined address string from the address sub-fields
  const addressId = contact.current_address ? String(contact.current_address) : null;
  const addressParts = addressSubFields
    .map((f) => String(contact[f.key] ?? ""))
    .filter(Boolean);
  const addressDisplay = addressParts.length > 0 ? addressParts.join(", ") : null;

  // Extract lat/lon for map
  const lat = Number(contact.latitude ?? contact["current_address.latitude"] ?? 0);
  const lon = Number(contact.longitude ?? contact["current_address.longitude"] ?? 0);
  const hasCoords = lat !== 0 || lon !== 0;

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!hasCoords || !mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false,
    }).setView([lat, lon], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
    L.marker([lat, lon]).addTo(map);
    leafletMap.current = map;
    return () => { map.remove(); leafletMap.current = null; };
  }, [hasCoords, lat, lon]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
      <div className={`w-full rounded-xl bg-surface-alt p-6 shadow-xl ${hasCoords ? "max-w-3xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handlePhotoSelect}
            />
            {isLinked ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                  className="group relative h-12 w-12 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
                  title="Upload photo"
                >
                  {currentPhoto ? (
                    <img src={currentPhoto} alt="" className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-light text-lg font-bold text-primary-text">
                      {String(contact.first_name || contact.name || "?")[0]}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {uploadingPhoto ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </span>
                </button>
                {currentPhoto && !uploadingPhoto && (
                  <button
                    type="button"
                    onClick={handlePhotoClear}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white shadow hover:bg-danger/80"
                    title="Remove photo"
                  >
                    ✕
                  </button>
                )}
              </div>
            ) : currentPhoto ? (
              <img src={currentPhoto} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : null}
            <h2 className="text-lg font-bold text-text">Details</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className={`${hasCoords ? "flex gap-6" : ""}`}>
          <div className={`${hasCoords ? "flex-1 min-w-0" : ""}`}>
            <dl className="space-y-3">
              {nonAddressFields.map((f) => {
                // Check for resolved multi-relation data
                const resolved = contact[`${f.key}._resolved`] as { id: string; label: string }[] | undefined;
                return (
                <div key={f.key} className="flex gap-3">
                  <dt className="w-24 shrink-0 text-sm font-medium text-text-muted">
                    {f.label}
                  </dt>
                  <dd className="text-sm text-text">
                    {Array.isArray(resolved) && resolved.length > 0 ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {resolved.map((r, i) => (
                          <span key={r.id}>
                            {onContactClick ? (
                              <button
                                type="button"
                                onClick={() => onContactClick(r.id)}
                                className="text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
                              >
                                {r.label}
                              </button>
                            ) : (
                              r.label
                            )}
                            {i < resolved.length - 1 && ","}
                          </span>
                        ))}
                      </span>
                    ) : (
                      String(contact[f.key] ?? "\u2014")
                    )}
                  </dd>
                </div>
                );
              })}
              {addressDisplay && (
                <div className="flex gap-3">
                  <dt className="w-24 shrink-0 text-sm font-medium text-text-muted">
                    Address
                  </dt>
                  <dd className="text-sm text-text">
                    {onAddressClick && addressId ? (
                      <button
                        type="button"
                        onClick={() => onAddressClick(addressId)}
                        className="text-left text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
                      >
                        {addressDisplay}
                      </button>
                    ) : (
                      addressDisplay
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {hasCoords && (
            <div className="w-64 shrink-0">
              <div
                ref={mapRef}
                className="h-full min-h-[200px] w-full rounded-lg border border-border"
                style={{ zIndex: 0 }}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-text-muted">
            Created: {new Date(String(contact.created ?? "")).toLocaleDateString()} · Updated:{" "}
            {new Date(String(contact.updated ?? "")).toLocaleDateString()}
          </div>
          <div className="flex gap-2">
            {onLinkCardDav && !isLinked && (
              <button
                onClick={onLinkCardDav}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
                title="Link this contact to a CardDAV contact"
              >
                🔗 Link CardDAV
              </button>
            )}
            {isLinked && (
              <span className="inline-flex items-center rounded-md bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary" title="Linked to CardDAV">
                ✓ CardDAV Linked
              </span>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Edit
              </button>
            )}
            {onRehydrate && (
              <button
                onClick={onRehydrate}
                disabled={rehydrating}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:opacity-50"
                title="Re-geocode this address via Mapbox"
              >
                {rehydrating ? "Geocoding…" : "📍 Rehydrate"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
