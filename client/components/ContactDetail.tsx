import { useEffect } from "react";
import type { Contact } from "../types/contact.ts";

interface SchemaField {
  name: string;
  type: string;
}

interface Props {
  contact: Contact;
  fields: SchemaField[];
  onClose: () => void;
  onEdit?: () => void;
}

function toLabel(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ContactDetail({ contact, fields, onClose, onEdit }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const displayFields = fields.length > 0
    ? fields.map((f) => ({ key: f.name, label: toLabel(f.name) }))
    : Object.keys(contact)
        .filter((k) => !["id", "collectionId", "collectionName", "created", "updated"].includes(k))
        .map((k) => ({ key: k, label: toLabel(k) }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
      <div className="w-full max-w-md rounded-xl bg-surface-alt p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-text">
            {String(contact[displayFields[0]?.key] ?? contact.id)}
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
        <dl className="space-y-3">
          {displayFields.map((f) => (
            <div key={f.key} className="flex gap-3">
              <dt className="w-24 shrink-0 text-sm font-medium text-text-muted">
                {f.label}
              </dt>
              <dd className="text-sm text-text">
                {String(contact[f.key] ?? "—")}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-text-muted">
            Created: {new Date(String(contact.created ?? "")).toLocaleDateString()} · Updated:{" "}
            {new Date(String(contact.updated ?? "")).toLocaleDateString()}
          </div>
          {onEdit && (
            <button
              onClick={onEdit}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
            >
              Edit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
