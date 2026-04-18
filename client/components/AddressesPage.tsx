import { useState, useEffect, useCallback } from "react";
import { useCollection } from "../hooks/useCollection.ts";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";
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
  const [rehydrating, _setRehydrating] = useState(false);
  const [rehydrateStatus, setRehydrateStatus] = useState<string | null>(null);
  const [rehydratingSingle, setRehydratingSingle] = useState(false);

  const handleRehydrateOne = useCallback(async (id: string) => {
    setRehydratingSingle(true);
    try {
      await ensureAuthenticated();
      const res = await fetch(`/api/server/rehydrate-address/${id}`, {
        method: "POST",
        headers: { Authorization: pb.authStore.token },
      });
      if (!res.ok) {
        const data = await res.json();
        setRehydrateStatus(`Failed: ${data.error || "Unknown error"}`);
        setTimeout(() => setRehydrateStatus(null), 4000);
      } else {
        const data = await res.json();
        setRehydrateStatus(`Geocoded → ${data._geo?.lat?.toFixed(4)}, ${data._geo?.lon?.toFixed(4)}`);
        refetch();
        setTimeout(() => { setRehydrateStatus(null); setSelected(null); }, 2000);
      }
    } catch {
      setRehydrateStatus("Geocode request failed");
      setTimeout(() => setRehydrateStatus(null), 4000);
    } finally {
      setRehydratingSingle(false);
    }
  }, [refetch]);

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

      {rehydrateStatus && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-2 text-sm text-text-secondary">
          {rehydrating && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          {rehydrateStatus}
        </div>
      )}

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
          onRehydrate={() => handleRehydrateOne(selected.id)}
          rehydrating={rehydratingSingle}
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
