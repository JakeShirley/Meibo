import { useState, useEffect, useCallback } from "react";
import { useCollection } from "../hooks/useCollection.ts";
import ContactsTable from "./ContactsTable.tsx";
import ContactDetail from "./ContactDetail.tsx";
import RecordForm from "./RecordForm.tsx";
import SearchBar from "./SearchBar.tsx";
import Pagination from "./Pagination.tsx";
import ExportButtons from "./ExportButtons.tsx";

const COLLECTION = "contact_addresses";

interface Address {
  id: string;
  [key: string]: unknown;
}

export default function AddressesPage() {
  const {
    collectionName,
    items,
    fields,
    rawSchema,
    loading,
    error,
    page,
    setPage,
    totalPages,
    totalItems,
    setSearch,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    fetchAll,
    refetch,
  } = useCollection<Address>(COLLECTION);

  const [selected, setSelected] = useState<Address | null>(null);
  const [editing, setEditing] = useState<Address | null | "new">(null);
  const [searchInput, setSearchInput] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setSearch, setPage]);

  const handleSort = useCallback(
    (field: string) => {
      if (field === sortField) {
        setSortDir(sortDir === "asc" ? "desc" : "asc");
      } else {
        setSortField(field);
        setSortDir("asc");
      }
      setPage(1);
    },
    [sortField, sortDir, setSortField, setSortDir, setPage],
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-full sm:w-72">
            <SearchBar value={searchInput} onChange={setSearchInput} />
          </div>
          <button
            onClick={() => setEditing("new")}
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
          >
            + Add
          </button>
        </div>
        <ExportButtons fetchAll={fetchAll} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <ContactsTable
            contacts={items}
            fields={fields}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            onSelect={setSelected}
          />
          <div className="mt-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              totalItems={totalItems}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      {selected && (
        <ContactDetail
          contact={selected}
          fields={fields}
          onClose={() => setSelected(null)}
          onEdit={() => { setEditing(selected); setSelected(null); }}
        />
      )}

      {editing && (
        <RecordForm
          collection={collectionName}
          fields={rawSchema}
          record={editing === "new" ? null : editing}
          onSave={() => { setEditing(null); refetch(); }}
          onClose={() => setEditing(null)}
          onDelete={() => { setEditing(null); refetch(); }}
        />
      )}
    </>
  );
}
