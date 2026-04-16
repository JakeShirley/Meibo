import { useState, useEffect, useMemo } from "react";
import { useCollection } from "../hooks/useCollection.ts";
import ContactDetail from "./ContactDetail.tsx";
import RecordForm from "./RecordForm.tsx";
import SearchBar from "./SearchBar.tsx";
import ExportButtons from "./ExportButtons.tsx";

interface Record {
  id: string;
  [key: string]: unknown;
}

export default function FamilySidesPage() {
  const contacts = useCollection<Record>("contacts");
  const tags = useCollection<Record>("group_tags");

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

    // Seed with all known tags so empty ones still appear
    for (const tag of tags.items) {
      const name = String(tag.name ?? "").trim();
      if (name) groups.set(name, []);
    }

    for (const item of filtered) {
      const side = String(item[familySideField] ?? "").trim() || "Unassigned";
      if (!groups.has(side)) groups.set(side, []);
      groups.get(side)!.push(item);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, familySideField, tags.items]);

  useEffect(() => {
    if (grouped.length > 0 && expandedSide === null) {
      setExpandedSide(grouped[0][0]);
    }
  }, [grouped, expandedSide]);

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
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-blue-700"
          >
            + Tag
          </button>
        </div>
        <ExportButtons fetchAll={contacts.fetchAll} />
      </div>

      {(contacts.error || tags.error) && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {contacts.error || tags.error}
        </div>
      )}

      {contacts.loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-gray-400">
              No contacts found.
            </div>
          ) : (
            grouped.map(([side, members]) => (
              <div key={side} className="rounded-lg border border-gray-200 bg-white">
                <button
                  onClick={() => setExpandedSide(expandedSide === side ? null : side)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold capitalize text-gray-900">
                      {side}
                    </span>
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
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
                        className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                      >
                        Edit
                      </span>
                    )}
                  </div>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${expandedSide === side ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedSide === side && (
                  <div className="border-t border-gray-100">
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
                              className="cursor-pointer transition-colors hover:bg-blue-50"
                            >
                              <td className="px-4 py-2 font-medium text-gray-900">
                                {name || member.id}
                              </td>
                              <td className="px-4 py-2 text-gray-500">
                                {String(member.email ?? "")}
                              </td>
                              <td className="px-4 py-2 text-gray-500">
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
