import { useState, useEffect, useCallback } from "react";
import { useContacts } from "./hooks/useContacts.ts";
import ContactsTable from "./components/ContactsTable.tsx";
import ContactDetail from "./components/ContactDetail.tsx";
import SearchBar from "./components/SearchBar.tsx";
import Pagination from "./components/Pagination.tsx";
import ExportButtons from "./components/ExportButtons.tsx";
import AddressesPage from "./components/AddressesPage.tsx";
import FamilySidesPage from "./components/FamilySidesPage.tsx";
import type { Contact } from "./types/contact.ts";

type Tab = "contacts" | "addresses" | "family_sides";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");

  const {
    contacts,
    displayFields,
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
  } = useContacts();

  const [selected, setSelected] = useState<Contact | null>(null);
  const [searchInput, setSearchInput] = useState("");

  // Debounce search input
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

  const tabs: { key: Tab; label: string }[] = [
    { key: "contacts", label: "Contacts" },
    { key: "addresses", label: "Addresses" },
    { key: "family_sides", label: "Group Tags" },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-gray-50 px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contact Book</h1>
        <p className="text-sm text-gray-500">
          Browse and export your contacts
        </p>
      </header>

      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "contacts" && (
        <>
          <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <SearchBar value={searchInput} onChange={setSearchInput} />
            </div>
            <ExportButtons fetchAll={fetchAll} />
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
                contacts={contacts}
                fields={displayFields.tableFields}
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
              fields={displayFields.detailFields}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}

      {activeTab === "addresses" && <AddressesPage />}

      {activeTab === "family_sides" && <FamilySidesPage />}
    </div>
  );
}
