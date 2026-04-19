import { useState } from "react";
import { contacts as contactsApi, type SchemaField } from "../lib/api.ts";

interface TagOption {
  id: string;
  label: string;
}

interface Props {
  selectedCount: number;
  selectedIds: Set<string>;
  schema: SchemaField[];
  onDone: () => void;
  onClear: () => void;
}

export default function BulkActionBar({ selectedCount, selectedIds, schema, onDone, onClear }: Props) {
  const [showTagPicker, setShowTagPicker] = useState<"add" | "remove" | null>(null);
  const [applying, setApplying] = useState(false);
  const [pickedTags, setPickedTags] = useState<Set<string>>(new Set());

  const tagField = schema.find((f) => f.name === "group_tag");
  const tagOptions: TagOption[] = (tagField?.options?.items as TagOption[] | undefined) ?? [];

  const toggleTag = (id: string) => {
    setPickedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyTags = async () => {
    if (pickedTags.size === 0 || !showTagPicker) return;
    setApplying(true);
    try {
      await contactsApi.bulkUpdate(
        Array.from(selectedIds),
        { group_tag: Array.from(pickedTags) },
        showTagPicker,
      );
      setShowTagPicker(null);
      setPickedTags(new Set());
      onDone();
    } catch (err) {
      console.error(`[Bulk] Failed to ${showTagPicker} tags:`, err);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary-light px-4 py-2.5">
      <span className="text-sm font-medium text-primary-text">
        {selectedCount} selected
      </span>
      <div className="h-4 w-px bg-primary/30" />
      <button
        onClick={() => setShowTagPicker(showTagPicker === "add" ? null : "add")}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Add Tags
      </button>
      <button
        onClick={() => setShowTagPicker(showTagPicker === "remove" ? null : "remove")}
        className="rounded-md border border-danger-border bg-danger-bg px-3 py-1.5 text-sm font-medium text-danger-text transition-colors hover:bg-red-600 hover:text-white hover:border-red-600"
      >
        Remove Tags
      </button>
      <button
        onClick={onClear}
        className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:bg-surface-hover hover:text-text-secondary"
      >
        Clear
      </button>

      {showTagPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
          <div className="w-full max-w-sm rounded-xl bg-surface-alt p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-text">
              {showTagPicker === "add" ? "Add" : "Remove"} Tags {showTagPicker === "add" ? "to" : "from"} {selectedCount} Contact{selectedCount !== 1 ? "s" : ""}
            </h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {tagOptions.map((opt) => (
                <label
                  key={opt.id}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    pickedTags.has(opt.id)
                      ? showTagPicker === "remove"
                        ? "border-danger-border bg-danger-bg text-danger-text"
                        : "border-primary bg-primary-light text-primary-text"
                      : "border-input-border bg-surface-alt text-text-muted hover:border-input-focus"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={pickedTags.has(opt.id)}
                    onChange={() => toggleTag(opt.id)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
              {tagOptions.length === 0 && (
                <p className="text-sm text-text-muted">No tags available. Create tags first.</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowTagPicker(null); setPickedTags(new Set()); }}
                className="rounded-md px-4 py-2 text-sm text-text-muted hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                onClick={applyTags}
                disabled={applying || pickedTags.size === 0}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  showTagPicker === "remove"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-primary hover:bg-primary-hover"
                }`}
              >
                {applying ? "Applying\u2026" : showTagPicker === "remove" ? "Remove" : "Apply"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
