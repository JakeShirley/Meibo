import { useState, useEffect } from "react";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";

interface SchemaField {
  name: string;
  type: string;
  options?: { collectionId?: string };
}

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

export default function RecordForm({ collection, fields, record, onSave, onClose, onDelete }: Props) {
  const isEdit = !!record;
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Determine the raw schema fields (un-composed relations)
  // For relation_composed fields, the actual PB field is the same name with type "relation"
  // Filter out back-reference relations (where the related collection points back to this one)
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

  // Fetch options for relation fields
  useEffect(() => {
    const relationFields = rawFields.filter((f) => f.type === "relation" && f.options?.collectionId);
    if (relationFields.length === 0) return;

    (async () => {
      await ensureAuthenticated();
      const opts: Record<string, RelationOption[]> = {};
      for (const f of relationFields) {
        try {
          const colId = f.options!.collectionId!;
          const col = await pb.send(`/api/collections/${colId}`, { method: "GET" });
          const items = await pb.collection(col.name).getFullList({ sort: "created" });
          const textTypes = new Set(["text", "email", "url"]);
          const labelFields = (col.schema ?? [])
            .filter((s: SchemaField) => textTypes.has(s.type))
            .map((s: SchemaField) => s.name);

          opts[f.name] = items.map((item: Record<string, unknown>) => ({
            id: String(item.id),
            label: labelFields.map((lf: string) => item[lf]).filter(Boolean).join(" ") || String(item.id),
          }));
        } catch {
          opts[f.name] = [];
        }
      }
      setRelationOptions(opts);
    })();
  }, [fields]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await ensureAuthenticated();
      // Build payload
      const payload: Record<string, unknown> = {};
      for (const f of rawFields) {
        const val = values[f.name];
        if (f.type === "number") {
          payload[f.name] = val === "" ? 0 : Number(val);
        } else if (f.type === "relation") {
          // Don't send empty strings for relations — use null or omit
          payload[f.name] = val || null;
        } else {
          payload[f.name] = val ?? "";
        }
      }
      if (isEdit && record) {
        await pb.collection(collection).update(String(record.id), payload);
      } else {
        await pb.collection(collection).create(payload);
      }
      onSave();
    } catch (err: unknown) {
      // PocketBase ClientResponseError has nested data:
      // err.data = { code, message, data: { field: { code, message } } }
      // or err.response = { code, message, data: { field: { code, message } } }
      const pbe = err as {
        data?: { data?: Record<string, { message?: string }>; message?: string };
        response?: { data?: Record<string, { message?: string }> };
        message?: string;
      };
      const fieldData = pbe.response?.data || pbe.data?.data;
      if (fieldData && typeof fieldData === "object") {
        const fieldErrors = Object.entries(fieldData)
          .filter(([, v]) => v && typeof v === "object" && v.message)
          .map(([k, v]) => `${toLabel(k)}: ${v.message}`);
        if (fieldErrors.length > 0) {
          setError(fieldErrors.join("\n"));
          return;
        }
      }
      setError(pbe.data?.message || pbe.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!record) return;
    setDeleting(true);
    setError(null);
    try {
      await ensureAuthenticated();
      await pb.collection(collection).delete(String(record.id));
      onDelete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const renderField = (f: SchemaField) => {
    const value = values[f.name] ?? "";

    if (f.type === "relation") {
      const options = relationOptions[f.name] ?? [];
      return (
        <select
          value={String(value)}
          onChange={(e) => handleChange(f.name, e.target.value)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );
    }

    if (f.type === "editor") {
      return (
        <textarea
          value={String(value)}
          onChange={(e) => handleChange(f.name, e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );
    }

    return (
      <input
        type={f.type === "email" ? "email" : "text"}
        value={String(value)}
        onChange={(e) => handleChange(f.name, e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {isEdit ? "Edit Record" : "New Record"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {rawFields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
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
                    <span className="text-sm text-red-600">Delete?</span>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
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
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
