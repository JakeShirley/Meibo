import { useState, useEffect, useCallback } from "react";
import { useCollection } from "../hooks/useCollection.ts";
import { contacts as contactsApi, addresses as addressesApi, tags as tagsApi } from "../lib/api.ts";
import ContactsTable from "./ContactsTable.tsx";
import ContactDetail from "./ContactDetail.tsx";
import SearchBar from "./SearchBar.tsx";
import Pagination from "./Pagination.tsx";
import ExportButtons from "./ExportButtons.tsx";

interface Props {
  collection: string;
}

interface Record {
  id: string;
  [key: string]: unknown;
}

export default function CollectionPage({ collection }: Props) {
  const {
    items,
    fields,
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
  } = useCollection<Record>(collection);

  const [selected, setSelected] = useState<Record | null>(null);
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
        <div className="w-full sm:max-w-sm">
          <SearchBar value={searchInput} onChange={setSearchInput} />
        </div>
        <ExportButtons exportUrl={(format) => {
          const api = collection === 'contact_addresses' ? addressesApi : collection === 'group_tags' ? tagsApi : contactsApi;
          return api.exportUrl(format);
        }} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
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
        />
      )}
    </>
  );
}
