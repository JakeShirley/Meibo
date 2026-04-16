import { useState, useEffect, useCallback } from "react";
import { useContacts } from "./hooks/useContacts.ts";
import ContactsTable from "./components/ContactsTable.tsx";
import ContactDetail from "./components/ContactDetail.tsx";
import RecordForm from "./components/RecordForm.tsx";
import SearchBar from "./components/SearchBar.tsx";
import Pagination from "./components/Pagination.tsx";
import ExportButtons from "./components/ExportButtons.tsx";
import AddressesPage from "./components/AddressesPage.tsx";
import FamilySidesPage from "./components/FamilySidesPage.tsx";
import ThemeToggle from "./components/ThemeToggle.tsx";
import FallingPetals from "./components/FallingPetals.tsx";
import PixelTrees from "./components/PixelTrees.tsx";
import MapPage from "./components/MapPage.tsx";
import type { Contact } from "./types/contact.ts";

type Tab = "contacts" | "addresses" | "family_sides" | "map";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("contacts");

  const {
    collectionName,
    contacts,
    displayFields,
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
  } = useContacts();

  const [selected, setSelected] = useState<Contact | null>(null);
  const [editing, setEditing] = useState<Contact | null | "new">(null);
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
    { key: "map", label: "Map" },
  ];

  return (
    <>
    <FallingPetals />
    <div className="mx-auto min-h-screen max-w-6xl bg-surface px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Contact Book</h1>
          <p className="text-sm text-text-muted">
            Browse and export your contacts
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="relative mb-6 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative z-20 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-primary text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
        <PixelTrees />
      </div>

      {activeTab === "contacts" && (
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
      )}

      {activeTab === "addresses" && <AddressesPage />}

      {activeTab === "family_sides" && <FamilySidesPage />}

      {activeTab === "map" && <MapPage />}
    </div>
    </>
  );
}
