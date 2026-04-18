import { useState, useEffect, useCallback, useMemo } from "react";
import { useContacts } from "./hooks/useContacts.ts";
import { useLinks } from "./hooks/useLinks.ts";
import { useCardDav, type CardDavContact } from "./hooks/useCardDav.ts";
import { contacts as contactsApi, type Contact } from "./lib/api.ts";
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
import CardDavPage from "./components/CardDavPage.tsx";
import LinkFromDetailDialog from "./components/LinkFromDetailDialog.tsx";

type Tab = "contacts" | "addresses" | "family_sides" | "map" | "carddav";

const TAB_HASH: Record<Tab, string> = {
  contacts: "contacts",
  addresses: "addresses",
  family_sides: "groups",
  map: "map",
  carddav: "carddav",
};
const HASH_TAB: Record<string, Tab> = Object.fromEntries(
  Object.entries(TAB_HASH).map(([k, v]) => [v, k as Tab]),
);

function parseHash(): { tab: Tab; id?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [segment, id] = hash.split("/");
  const tab = HASH_TAB[segment] ?? "contacts";
  return { tab, id: id || undefined };
}

function setHash(tab: Tab, id?: string) {
  const base = TAB_HASH[tab];
  const hash = id ? `#${base}/${id}` : `#${base}`;
  if (window.location.hash !== hash) {
    window.history.replaceState(null, "", hash);
  }
}

export default function App() {
  const initial = parseHash();
  const [activeTab, setActiveTab] = useState<Tab>(initial.tab);
  const [pendingDeepLinkId, setPendingDeepLinkId] = useState<string | undefined>(initial.id);

  const {
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
    refetch,
  } = useContacts();

  const { links, linkToExisting, linkCreateNew } = useLinks();
  const linkedIds = useMemo(() => new Set(Object.keys(links)), [links]);

  // Photos come enriched from the server in _photoUri
  const photoMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contacts) {
      if (c._photoUri) map[c.id] = c._photoUri as string;
    }
    return map;
  }, [contacts]);

  // CardDAV data (needed for LinkFromDetailDialog)
  const { contacts: davContacts, books, selectedBook } = useCardDav();

  const [selected, setSelected] = useState<Contact | null>(null);
  const [editing, setEditing] = useState<Contact | null | "new">(null);
  const [linkingFromDetail, setLinkingFromDetail] = useState<Contact | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [deepLinkAddressId, setDeepLinkAddressId] = useState<string | null>(
    initial.tab === "addresses" && initial.id ? initial.id : null,
  );

  // Sync URL hash when contact detail opens/closes on the contacts tab
  useEffect(() => {
    if (activeTab === "contacts") {
      setHash("contacts", selected ? selected.id : undefined);
    }
  }, [selected, activeTab]);

  // Handle initial deep-link: open contact detail from URL on first load
  useEffect(() => {
    if (!pendingDeepLinkId) return;
    const id = pendingDeepLinkId;
    setPendingDeepLinkId(undefined);
    if (activeTab === "contacts") {
      contactsApi.get(id).then((c) => setSelected(c)).catch(() => {});
    }
    // Address deep-link is handled via deepLinkAddressId state passed to AddressesPage
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for hashchange (browser back/forward)
  useEffect(() => {
    const onHashChange = () => {
      const { tab, id } = parseHash();
      setActiveTab(tab);
      setSelected(null);
      if (tab === "contacts" && id) {
        contactsApi.get(id).then((c) => setSelected(c)).catch(() => {});
      } else if (tab === "addresses" && id) {
        setDeepLinkAddressId(id);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Contacts are enriched with _linked from server, so filter on that
  const displayedContacts = linkFilter === "all"
    ? contacts
    : contacts.filter((c) => linkFilter === "linked" ? c._linked : !c._linked);

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

  // Deep-link to address detail: switch to Addresses tab and open the address
  const handleAddressClick = useCallback((addressId: string) => {
    setSelected(null);
    setDeepLinkAddressId(addressId);
    setActiveTab("addresses");
    window.history.pushState(null, "", `#addresses/${addressId}`);
  }, []);

  // Deep-link to contact detail: switch to Contacts tab and open the contact
  const handleContactDeepLink = useCallback(async (contactId: string) => {
    setActiveTab("contacts");
    window.history.pushState(null, "", `#contacts/${contactId}`);
    try {
      const contact = await contactsApi.get(contactId);
      setSelected(contact);
    } catch (err) {
      console.error("[DeepLink] Failed to load contact:", err);
    }
  }, []);

  // Single-call: server fetches PB data, creates vCard, saves link
  const handleCreateAndLink = useCallback(
    async (contact: Contact) => {
      if (!books.length) return;
      const book = selectedBook || books[0].href;
      try {
        await linkCreateNew(contact.id, book);
        setLinkingFromDetail(null);
      } catch (err) {
        console.error("[Link] Failed to create CardDAV contact:", err);
      }
    },
    [books, selectedBook, linkCreateNew],
  );

  // Single-call: server fetches PB data, syncs to existing vCard, saves link
  const handleLinkExisting = useCallback(
    async (contact: Contact, davContact: CardDavContact) => {
      try {
        await linkToExisting(contact.id, davContact.href);
        setLinkingFromDetail(null);
      } catch (err) {
        console.error("[Link] Failed to link:", err);
      }
    },
    [linkToExisting],
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: "contacts", label: "Contacts" },
    { key: "addresses", label: "Addresses" },
    { key: "family_sides", label: "Group Tags" },
    { key: "map", label: "Map" },
    { key: "carddav", label: "CardDAV" },
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
            onClick={() => {
              setActiveTab(tab.key);
              setSelected(null);
              window.history.pushState(null, "", `#${TAB_HASH[tab.key]}`);
            }}
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
              <div className="flex items-center overflow-hidden rounded-md border border-border text-sm">
                {(["all", "linked", "unlinked"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setLinkFilter(v)}
                    className={`px-2.5 py-1 capitalize transition-colors first:rounded-l-md last:rounded-r-md ${
                      linkFilter === v
                        ? "bg-primary text-white"
                        : "text-text-secondary hover:bg-surface-hover"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <ExportButtons exportUrl={(format) => contactsApi.exportUrl(format, { sort: sortField ? (sortDir === "asc" ? sortField : `-${sortField}`) : "", search: searchInput })} />
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
                contacts={displayedContacts}
                fields={displayFields.tableFields}
                sortField={sortField}
                sortDir={sortDir}
                onSort={handleSort}
                onSelect={setSelected}
                linkedIds={linkedIds}
                photoMap={photoMap}
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
              photoUri={photoMap[selected.id]}
              isLinked={!!selected._linked}
              onLinkCardDav={() => { setLinkingFromDetail(selected); }}
              onAddressClick={handleAddressClick}
            />
          )}

          {linkingFromDetail && (
            <LinkFromDetailDialog
              contact={linkingFromDetail}
              davContacts={davContacts.filter((c) => !Object.values(links).includes(c.href))}
              books={books}
              selectedBook={selectedBook || books[0]?.href || ""}
              onCreateNew={handleCreateAndLink}
              onLinkExisting={handleLinkExisting}
              onClose={() => setLinkingFromDetail(null)}
            />
          )}

          {editing && (
            <RecordForm
              collection="contacts"
              fields={rawSchema}
              record={editing === "new" ? null : editing}
              onSave={() => {
                // Server auto-syncs to CardDAV if the contact is linked
                setEditing(null);
                refetch();
              }}
              onClose={() => setEditing(null)}
              onDelete={() => { setEditing(null); refetch(); }}
            />
          )}
        </>
      )}

      {activeTab === "addresses" && (
        <AddressesPage
          initialAddressId={deepLinkAddressId}
          onAddressViewed={() => setDeepLinkAddressId(null)}
        />
      )}

      {activeTab === "family_sides" && <FamilySidesPage />}

      {activeTab === "map" && <MapPage onContactSelect={handleContactDeepLink} onAddressSelect={handleAddressClick} />}

      {activeTab === "carddav" && <CardDavPage />}
    </div>
    </>
  );
}
