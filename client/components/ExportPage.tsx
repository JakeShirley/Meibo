import { useState, useEffect, useMemo } from "react";
import { tags as tagsApi, contacts as contactsApi, schema as schemaApi, type SchemaField } from "../lib/api.ts";

interface Tag {
  id: string;
  name: string;
  [key: string]: unknown;
}

type Format = "csv" | "json";

const DEFAULT_FIELDS = new Set([
  "name",
  "current_address",
]);

const SKIP_FIELDS = new Set(["carddav_href"]);

// Synthetic field added to schema options
const SYNTHETIC_FIELDS: SchemaField[] = [
  { name: "name", type: "text", required: false },
];

function toLabel(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ExportPage() {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<Format>("csv");
  const [loading, setLoading] = useState(true);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [allFields, setAllFields] = useState<SchemaField[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(DEFAULT_FIELDS));
  const [combineHouseholds, setCombineHouseholds] = useState(true);
  const [dropCountry, setDropCountry] = useState(true);
  const [addressFormat, setAddressFormat] = useState<"single" | "separated" | "street-separated">("single");

  // Load all tags and schema fields
  useEffect(() => {
    (async () => {
      try {
        const [tagRes, schemaRes] = await Promise.all([
          tagsApi.list({ perPage: 200, sort: "name" }),
          schemaApi.contacts(),
        ]);
        setAllTags(tagRes.items as Tag[]);
        setAllFields([
          ...SYNTHETIC_FIELDS,
          ...schemaRes.fields.filter((f) => !SKIP_FIELDS.has(f.name)),
        ]);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Preview: count matching contacts when tags change
  useEffect(() => {
    const tagIds = Array.from(selectedTags);
    if (tagIds.length === 0) {
      setPreviewCount(null);
      return;
    }
    setLoadingPreview(true);
    const timer = setTimeout(async () => {
      try {
        const filter = tagIds.map((id) => `group_tag ~ "${id}"`).join(" || ");
        // Use a minimal request to just get count
        const res = await contactsApi.list({ page: 1, perPage: 1, filter });
        setPreviewCount(res.totalItems);
      } catch {
        setPreviewCount(null);
      } finally {
        setLoadingPreview(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [selectedTags]);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedTags(new Set(allTags.map((t) => t.id)));
  const selectNone = () => setSelectedTags(new Set());

  const toggleField = (name: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const selectAllFields = () => setSelectedFields(new Set(allFields.map((f) => f.name)));
  const selectDefaultFields = () => setSelectedFields(new Set(DEFAULT_FIELDS));

  // Build export field names — expand relation fields to dot-notation
  const exportFieldNames = useMemo(() => {
    const names: string[] = [];
    for (const f of allFields) {
      if (!selectedFields.has(f.name)) continue;
      if (f.type === "relation") {
        // Relations get expanded to sub-fields like current_address.address_street
        // The server will include all sub-fields for each selected relation
        names.push(f.name);
      } else {
        names.push(f.name);
      }
    }
    return names;
  }, [allFields, selectedFields]);

  const exportUrl = useMemo(() => {
    const qs = new URLSearchParams({ format });
    const tagIds = Array.from(selectedTags);
    if (tagIds.length > 0) qs.set("tags", tagIds.join(","));
    if (exportFieldNames.length > 0 && exportFieldNames.length < allFields.length) {
      qs.set("fields", exportFieldNames.join(","));
    }
    if (combineHouseholds) qs.set("combine", "true");
    if (!dropCountry) qs.set("dropcountry", "false");
    if (addressFormat === "separated") qs.set("addrformat", "separated");
    if (addressFormat === "street-separated") qs.set("addrformat", "street-separated");
    return `/api/contacts/export?${qs}`;
  }, [format, selectedTags, exportFieldNames, allFields.length, combineHouseholds, dropCountry, addressFormat]);

  const handleExport = () => {
    window.open(exportUrl, "_blank");
  };

  const matchLabel = selectedTags.size === 0
    ? "all contacts"
    : loadingPreview
      ? "counting…"
      : previewCount !== null
        ? `${previewCount} contact${previewCount !== 1 ? "s" : ""}`
        : "…";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-bold text-text">Export Contacts</h1>
      <p className="mb-6 text-sm text-text-muted">
        Select tags to filter which contacts to export, then choose a format.
      </p>

      {/* Tag selector */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text">Filter by Tags</label>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAll} className="text-primary hover:underline">
              Select all
            </button>
            <span className="text-text-muted">·</span>
            <button type="button" onClick={selectNone} className="text-primary hover:underline">
              Clear
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : allTags.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">No tags found</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {allTags.map((tag) => {
              const active = selectedTags.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary-light text-primary-text"
                      : "border-input-border bg-surface-alt text-text-muted hover:border-input-focus hover:text-text"
                  }`}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Field selector */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium text-text">Fields to Export</label>
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={selectAllFields} className="text-primary hover:underline">
              All
            </button>
            <span className="text-text-muted">·</span>
            <button type="button" onClick={selectDefaultFields} className="text-primary hover:underline">
              Default
            </button>
          </div>
        </div>
        {allFields.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allFields.map((f) => {
              const active = selectedFields.has(f.name);
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => toggleField(f.name)}
                  className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary-light text-primary-text"
                      : "border-input-border bg-surface-alt text-text-muted hover:border-input-focus hover:text-text"
                  }`}
                >
                  {toLabel(f.name)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Options */}
      <div className="mb-6 space-y-3">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={combineHouseholds}
            onChange={(e) => setCombineHouseholds(e.target.checked)}
            className="h-4 w-4 rounded border-input-border accent-primary"
          />
          <div>
            <span className="text-sm font-medium text-text">Combine households</span>
            <p className="text-xs text-text-muted">
              Merge people sharing an address into one row (e.g. "Jane & John Doe")
            </p>
          </div>
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={dropCountry}
            onChange={(e) => setDropCountry(e.target.checked)}
            className="h-4 w-4 rounded border-input-border accent-primary"
          />
          <div>
            <span className="text-sm font-medium text-text">Drop domestic country</span>
            <p className="text-xs text-text-muted">
              Omit "United States of America" from addresses (for domestic mailings)
            </p>
          </div>
        </label>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text">Address format</label>
          <select
            value={addressFormat}
            onChange={(e) => setAddressFormat(e.target.value as "single" | "separated" | "street-separated")}
            className="rounded-md border border-input-border bg-surface-alt px-3 py-1.5 text-sm text-text focus:border-input-focus focus:outline-none"
          >
            <option value="single">Single address line</option>
            <option value="street-separated">Street address separated</option>
            <option value="separated">Separated address</option>
          </select>
        </div>
      </div>

      {/* Format selector */}
      <div className="mb-6">
        <label className="mb-2 block text-sm font-medium text-text">Format</label>
        <div className="flex gap-3">
          {(["csv", "json"] as const).map((f) => (
            <label
              key={f}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                format === f
                  ? "border-primary bg-primary-light text-primary-text"
                  : "border-border bg-surface-alt text-text-secondary hover:border-input-focus"
              }`}
            >
              <input
                type="radio"
                name="format"
                value={f}
                checked={format === f}
                onChange={() => setFormat(f)}
                className="sr-only"
              />
              <span className="text-lg">{f === "csv" ? "📊" : "📋"}</span>
              {f.toUpperCase()}
            </label>
          ))}
        </div>
      </div>

      {/* Preview + Export */}
      <div className="rounded-lg border border-border bg-surface-alt px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-text">
              Ready to export {matchLabel}
            </p>
            <p className="text-xs text-text-muted">
              {selectedTags.size === 0
                ? "No tag filter — exports everyone"
                : `${selectedTags.size} tag${selectedTags.size !== 1 ? "s" : ""} selected`}
              {" · "}
              {selectedFields.size} field{selectedFields.size !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            Export {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
}
