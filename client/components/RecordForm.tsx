import { useState, useEffect } from "react";
import {
  contacts as contactsApi,
  addresses as addressesApi,
  tags as tagsApi,
  type SchemaField,
  type GeocodeSuggestion,
} from "../lib/api.ts";

interface RelationOption {
  id: string;
  label: string;
}

interface Props {
  collection: string;
  fields: SchemaField[];
  record?: Record<string, unknown> | null; // null = create, object = edit
  onSave: () => void;
  onClose: () => void;
  onDelete?: () => void;
}

function toLabel(name: string): string {
  return name.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);

function getCollectionApi(collection: string) {
  if (collection === "contact_addresses") return addressesApi;
  if (collection === "group_tags") return tagsApi;
  return contactsApi;
}

export default function RecordForm({ collection, fields, record, onSave, onClose, onDelete }: Props) {
  const isEdit = !!record;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [suggestion, setSuggestion] = useState<GeocodeSuggestion | null>(null);

  // Determine the raw schema fields (un-composed relations)
  const rawFields = fields.map((f) =>
    f.type === "relation_composed" ? { ...f, type: "relation" } : f,
  ).filter((f) => !SKIP.has(f.name) && !f.name.toLowerCase().includes("resident"));

  // Init form values from record
  useEffect(() => {
    if (record) {
      const init: Record<string, unknown> = {};
      for (const f of rawFields) {
        init[f.name] = record[f.name] ?? "";
      }
      setValues(init);
    } else {
      const init: Record<string, unknown> = {};
      for (const f of rawFields) {
        init[f.name] = "";
      }
      setValues(init);
    }
  }, [record]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate relation options from schema (pre-resolved by server)
  useEffect(() => {
    const opts: Record<string, RelationOption[]> = {};
    for (const f of rawFields) {
      if (f.type === "relation" && f.options?.items) {
        opts[f.name] = f.options.items as RelationOption[];
      }
    }
    setRelationOptions(opts);
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Build payload
      const payload: Record<string, unknown> = {};
      for (const f of rawFields) {
        const val = values[f.name];
        if (f.type === "number") {
          payload[f.name] = val === "" ? 0 : Number(val);
        } else if (f.type === "relation") {
          payload[f.name] = val || null;
        } else {
          payload[f.name] = val ?? "";
        }
      }

      const api = getCollectionApi(collection);
      let responseData: Record<string, unknown> | null = null;

      if (isEdit && record) {
        responseData = await api.update(String(record.id), payload) as Record<string, unknown>;
      } else {
        responseData = await api.create(payload) as Record<string, unknown>;
      }

      // Check for geocode suggestion on address saves
      const geocode = responseData?._geocode as GeocodeSuggestion | undefined;
      if (geocode && geocode.confidence !== "exact" && geocode.suggested_address) {
        const entered = [payload.address_street, payload.address_city, payload.address_state, payload.address_zip]
          .map(String).filter(Boolean).join(", ").toLowerCase();
        const suggested = [geocode.suggested_address.street, geocode.suggested_address.city, geocode.suggested_address.state, geocode.suggested_address.zip]
          .filter(Boolean).join(", ").toLowerCase();

        if (entered !== suggested) {
          setSuggestion(geocode);
          setSaving(false);
          return;
        }
      }

      onSave();
    } catch (err: unknown) {
      const e = err as { data?: { data?: Record<string, { message?: string }>; message?: string }; message?: string };
      const fieldData = e.data?.data;
      if (fieldData && typeof fieldData === "object") {
        const fieldErrors = Object.entries(fieldData)
          .filter(([, v]) => v && typeof v === "object" && v.message)
          .map(([k, v]) => `${toLabel(k)}: ${v.message}`);
        if (fieldErrors.length > 0) {
          setError(fieldErrors.join("\n"));
          return;
        }
      }
      setError(e.data?.message || e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setDeleting(true);
    setError(null);
    try {
      const api = getCollectionApi(collection);
      await api.delete(String(record.id));
      onDelete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const inputClass = "w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text focus:border-input-focus focus:outline-none focus:ring-1 focus:ring-input-focus";

  const renderField = (f: SchemaField) => {
    const value = values[f.name] ?? "";

    if (f.type === "relation") {
      const options = relationOptions[f.name] ?? [];
      return (
        <select
          value={String(value)}
          onChange={(e) => handleChange(f.name, e.target.value)}
          className={inputClass}
        >
          <option value="">— None —</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    if (f.type === "number") {
      return (
        <input
          type="number"
          value={String(value)}
          onChange={(e) => handleChange(f.name, e.target.value)}
          className={inputClass}
        />
      );
    }

    if (f.type === "editor") {
      return (
        <textarea
          value={String(value)}
          onChange={(e) => handleChange(f.name, e.target.value)}
          rows={3}
          className={inputClass}
        />
      );
    }

    return (
      <input
        type={f.type === "email" ? "email" : "text"}
        value={String(value)}
        onChange={(e) => handleChange(f.name, e.target.value)}
        className={inputClass}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-surface-alt p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">
            {isEdit ? "Edit Record" : "New Record"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-surface-hover hover:text-text-secondary"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        )}

        {suggestion && (
          <div className="mb-4 rounded-lg border border-primary bg-primary-light px-4 py-3 text-sm">
            <p className="mb-2 font-medium text-text">
              Mapbox suggests a different address (confidence: {suggestion.confidence}):
            </p>
            <p className="mb-3 text-text-secondary">
              {suggestion.suggested_address.full}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const s = suggestion.suggested_address;
                  setValues((prev) => ({
                    ...prev,
                    address_street: s.street,
                    address_city: s.city,
                    address_state: s.state,
                    address_zip: s.zip,
                    address_country: s.country,
                  }));
                  setSuggestion(null);
                }}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Use suggested address
              </button>
              <button
                type="button"
                onClick={() => {
                  setSuggestion(null);
                  onSave();
                }}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
              >
                Keep my address
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {rawFields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                {toLabel(f.name)}
              </label>
              {renderField(f)}
            </div>
          ))}

          <div className="flex items-center justify-between gap-3 pt-2">
            <div>
              {isEdit && onDelete && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-danger">Delete?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger-hover disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-bg"
                  >
                    Delete
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : isEdit ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
