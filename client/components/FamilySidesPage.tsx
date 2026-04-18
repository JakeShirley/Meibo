import { useState, useMemo } from "react";
import { useCollection } from "../hooks/useCollection.ts";
import { contacts as contactsApi } from "../lib/api.ts";
import ContactDetail from "./ContactDetail.tsx";
import RecordForm from "./RecordForm.tsx";
import SearchBar from "./SearchBar.tsx";
import ExportButtons from "./ExportButtons.tsx";

interface Record {
  id: string;
  [key: string]: unknown;
}

export default function FamilySidesPage() {
  const contacts = useCollection<Record>("contacts", { perPage: 500 });
  const tags = useCollection<Record>("group_tags", { perPage: 200 });

  const [selected, setSelected] = useState<Record | null>(null);
  const [editingContact, setEditingContact] = useState<Record | null | "new">(null);
  const [editingTag, setEditingTag] = useState<Record | null | "new">(null);
  const [searchInput, setSearchInput] = useState("");
  const [expandedSide, setExpandedSide] = useState<string | null>(null);

  // Find the family relation field — prefer the new relation field, fall back to text
  const familySideField = useMemo(() => {
    const relation = contacts.fields.find((f) => f.name === "group_tag");
    if (relation) return "group_tag";
    const legacy = contacts.fields.find((f) => f.name === "family_relation" || f.name === "family_side");
    if (legacy) return legacy.name;
    const generic = contacts.fields.find((f) => f.name.toLowerCase().includes("group") || f.name.toLowerCase().includes("family"));
    return generic?.name ?? "group_tag";
  }, [contacts.fields]);

  const filtered = useMemo(() => {
    if (!searchInput) return contacts.items;
    const q = searchInput.toLowerCase();
    return contacts.items.filter((item) =>
      Object.values(item).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      ),
    );
  }, [contacts.items, searchInput]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Record[]>();

    // Build a lookup from tag ID to tag name
    const tagIdToName = new Map<string, string>();
    for (const tag of tags.items) {
      const name = String(tag.name ?? "").trim();
      if (name) {
        tagIdToName.set(tag.id, name);
        groups.set(name, []);
      }
    }

    for (const item of filtered) {
      // group_tag may be a raw ID (relation field) — resolve to tag name
      const rawValue = String(item[familySideField] ?? "").trim();
      // Try dot-notation expanded name first, then ID lookup, then raw value
      const tagName = String(item[`${familySideField}.name`] ?? "").trim()
        || tagIdToName.get(rawValue)
        || "";
      const side = tagName || "Unassigned";
      if (!groups.has(side)) groups.set(side, []);
      groups.get(side)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, familySideField, tags.items]);

  const detailFields = useMemo(() => {
    return contacts.fields.filter((f) => f.name !== familySideField);
  }, [contacts.fields, familySideField]);

  const handleRefresh = () => {
    contacts.refetch();
    tags.refetch();
  };

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-full sm:w-72">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
          <button
            onClick={() => setEditingTag("new")}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-primary-hover"
          >
            + Tag
          </button>
        </div>
        <ExportButtons exportUrl={(format) => contactsApi.exportUrl(format)} />
      </div>

      {(contacts.error || tags.error) && (
        <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {contacts.error || tags.error}
        </div>
      )}

      {contacts.loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface-alt px-4 py-8 text-center text-text-muted">
              No contacts found.
            </div>
          ) : (
            grouped.map(([side, members]) => (
              <div key={side} className="rounded-lg border border-border bg-surface-alt">
                <button
                  onClick={() => setExpandedSide(expandedSide === side ? null : side)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-hover"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold capitalize text-text">
                      {side}
                    </span>
                    <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary-text">
                      {members.length}
                    </span>
                    {side !== "Unassigned" && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          const tagRecord = tags.items.find(
                            (t) => String(t.name ?? "").toLowerCase() === side.toLowerCase()
                          );
                          if (tagRecord) setEditingTag(tagRecord);
                        }}
                        className="rounded px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                      >
                        Edit
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-4 w-4 text-text-muted transition-transform ${expandedSide === side ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSide === side && (
                  <div className="border-t border-border-light">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <tbody className="divide-y divide-gray-50">
                        {members.map((member) => {
                          const name = [
                            member.first_name ?? member.name ?? "",
                            member.last_name ?? "",
                          ]
                            .map(String)
                            .filter(Boolean)
                            .join(" ");
                          return (
                            <tr
                              key={member.id}
                              onClick={() => setSelected(member)}
                              className="cursor-pointer transition-colors hover:bg-surface-hover"
                            >
                              <td className="px-4 py-2 font-medium text-text">
                                {name || member.id}
                              </td>
                              <td className="px-4 py-2 text-text-secondary">
                                {String(member.email ?? "")}
                              </td>
                              <td className="px-4 py-2 text-text-secondary">
                                {String(member.phone_number ?? member.phone ?? "")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <ContactDetail
          contact={selected}
          fields={detailFields}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditingContact(selected); setSelected(null); }}
        />
      )}

      {editingContact && (
        <RecordForm
          collection="contacts"
          fields={contacts.rawSchema}
          record={editingContact === "new" ? null : editingContact}
          onSave={() => { setEditingContact(null); handleRefresh(); }}
          onClose={() => setEditingContact(null)}
          onDelete={() => { setEditingContact(null); handleRefresh(); }}
        />
      )}

      {editingTag && (
        <RecordForm
          collection="group_tags"
          fields={tags.rawSchema}
          record={editingTag === "new" ? null : editingTag}
          onSave={() => { setEditingTag(null); handleRefresh(); }}
          onClose={() => setEditingTag(null)}
          onDelete={() => { setEditingTag(null); handleRefresh(); }}
        />
      )}
    </>
  );
}
