import type { Contact } from "../types/contact.ts";

interface SchemaField {
  name: string;
  type: string;
}

interface Props {
  contacts: Contact[];
  fields: SchemaField[];
  sortField: string;
  sortDir: "asc" | "desc";
  onSort: (field: string) => void;
  onSelect: (contact: Contact) => void;
  linkedIds?: Set<string>;
  photoMap?: Record<string, string>;
}

function toLabel(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCellValue(contact: Contact, col: { key: string; type: string }): string {
  if (col.type === "relation_composed") {
    // First check for dot-notation sub-fields (from useContacts flattening)
    const prefix = `${col.key}.`;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(contact)) {
      if (k.startsWith(prefix) && v) {
        parts.push(String(v));
      }
    }
    if (parts.length > 0) return parts.join(", ");
    // Fall back to direct value (from useCollection flattening)
    const direct = contact[col.key];
    if (direct && typeof direct === "string") return direct;
    return "—";
  }
  return String(contact[col.key] ?? "");
}

export default function ContactsTable({
  contacts,
  fields,
  sortField,
  sortDir,
  onSort,
  onSelect,
  linkedIds,
  photoMap,
}: Props) {
  const columns = fields.length > 0
    ? fields.map((f) => ({ key: f.name, label: toLabel(f.name), type: f.type }))
    : [{ key: "id", label: "ID", type: "text" }];

  const arrow = (field: string) => {
    if (field !== sortField) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-thead">
          <tr>
            {linkedIds && <th className="w-8 px-2 py-3"></th>}
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => col.type !== "relation_composed" ? onSort(col.key) : undefined}
                className={`select-none px-4 py-3 text-left font-semibold text-text ${col.type !== "relation_composed" ? "cursor-pointer hover:bg-surface-hover" : ""}`}
              >
                {col.label}
                {col.type !== "relation_composed" && arrow(col.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-light bg-surface-alt">
          {contacts.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (linkedIds ? 1 : 0)}
                className="px-4 py-8 text-center text-text-muted"
              >
                No contacts found.
              </td>
            </tr>
          ) : (
            contacts.map((contact) => (
              <tr
                key={contact.id}
                onClick={() => onSelect(contact)}
                className="cursor-pointer transition-colors hover:bg-surface-hover"
              >
                {linkedIds && (
                  <td className="px-2 py-3 text-center">
                    {linkedIds.has(contact.id) ? (
                      <span title="Linked to CardDAV" className="text-primary">🔗</span>
                    ) : (
                      <span className="text-text-muted opacity-30">○</span>
                    )}
                  </td>
                )}
                {columns.map((col, i) => {
                  const photo = i === 0 && photoMap ? photoMap[contact.id] : undefined;
                  return (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${i === 0 ? "font-medium text-text" : "text-text-secondary"}`}
                    >
                      {i === 0 && photo ? (
                        <div className="flex items-center gap-2">
                          <img src={photo} alt="" className="h-7 w-7 rounded-full object-cover" />
                          {getCellValue(contact, col)}
                        </div>
                      ) : (
                        getCellValue(contact, col)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
