import { useState, useEffect, useCallback, useMemo, type FormEvent, type ReactNode } from "react";
import { useContacts } from "./hooks/useContacts.ts";
import { useLinks } from "./hooks/useLinks.ts";
import { useCardDav, type CardDavContact } from "./hooks/useCardDav.ts";
import {
  AUTH_REQUIRED_EVENT,
  checkAuthentication,
  contacts as contactsApi,
  login,
  type AuthState,
  type Contact,
  type MergeFieldSelections,
} from "./lib/api.ts";
import ContactsTable from "./components/ContactsTable.tsx";
import ContactDetail from "./components/ContactDetail.tsx";
import RecordForm from "./components/RecordForm.tsx";
import SearchBar from "./components/SearchBar.tsx";
import Pagination from "./components/Pagination.tsx";
import AddressesPage from "./components/AddressesPage.tsx";
import GroupTagsPage from "./components/GroupTagsPage.tsx";
import FallingPetals from "./components/FallingPetals.tsx";
import MapPage from "./components/MapPage.tsx";
import CardDavPage from "./components/CardDavPage.tsx";
import ExportPage from "./components/ExportPage.tsx";
import LinkFromDetailDialog from "./components/LinkFromDetailDialog.tsx";
import LinkMergeDialog from "./components/LinkMergeDialog.tsx";
import BulkActionBar from "./components/BulkActionBar.tsx";
import SidebarLayout from "./components/layouts/SidebarLayout.tsx";

type Tab = "contacts" | "addresses" | "groups" | "map" | "carddav" | "export";

const TAB_HASH: Record<Tab, string> = {
  contacts: "contacts",
  addresses: "addresses",
  groups: "groups",
  map: "map",
  carddav: "carddav",
  export: "export",
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

function AuthFrame({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <FallingPetals />
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-8 text-text">
        <div className="w-full max-w-sm rounded-lg border border-border bg-surface-alt p-6 shadow-sm">
          {children}
        </div>
      </main>
    </>
  );
}

function AuthStatus({ message, loading, onRetry }: { message: string; loading: boolean; onRetry: () => void }) {
  return (
    <AuthFrame>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">Meibo</h1>
        {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
      </div>
      <p className="text-sm text-text-secondary">{message}</p>
      {!loading && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          Retry
        </button>
      )}
    </AuthFrame>
  );
}

function LoginScreen({ onLogin }: { onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!username || !password) {
      setError("Username and password are required");
      return;
    }

    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-text">Meibo</h1>
          <p className="mt-1 text-sm text-text-secondary">Sign in</p>
        </div>

        <div>
          <label htmlFor="auth-username" className="mb-1 block text-sm font-medium text-text">
            Username
          </label>
          <input
            id="auth-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
            className="w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-input-focus"
          />
        </div>

        <div>
          <label htmlFor="auth-password" className="mb-1 block text-sm font-medium text-text">
            Password
          </label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text outline-none focus:border-input-focus"
          />
        </div>

        {error && (
          <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthFrame>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refreshAuth = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      setAuthState(await checkAuthentication());
    } catch (err) {
      setAuthState(null);
      setAuthError(err instanceof Error ? err.message : "Auth check failed");
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setAuthState({ authEnabled: true, authenticated: false });
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  const handleLogin = useCallback(async (username: string, password: string) => {
    setAuthState(await login(username, password));
  }, []);

  if (authLoading || !authState) {
    return (
      <AuthStatus
        message={authError ?? "Checking access..."}
        loading={authLoading}
        onRetry={refreshAuth}
      />
    );
  }

  if (authState.authEnabled && !authState.authenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return <MeiboApp />;
}

function MeiboApp() {
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

  const { links, linkCreateNew, mergeAndLink } = useLinks();
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
  const [mergingFromDetail, setMergingFromDetail] = useState<{ pb: Contact; dav: CardDavContact } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [deepLinkAddressId, setDeepLinkAddressId] = useState<string | null>(
    initial.tab === "addresses" && initial.id ? initial.id : null,
  );
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  const toggleBulkSelect = useCallback((id: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const toggleBulkSelectAll = useCallback(() => {
    setBulkSelected((prev) => {
      const allOnPage = displayedContacts.map((c) => c.id);
      const allSelected = allOnPage.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        for (const id of allOnPage) next.delete(id);
        return next;
      } else {
        return new Set([...prev, ...allOnPage]);
      }
    });
  }, [displayedContacts]);

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

  // Transition from LinkFromDetailDialog → LinkMergeDialog for field selection
  const handleLinkExisting = useCallback(
    async (contact: Contact, davContact: CardDavContact) => {
      setLinkingFromDetail(null);
      setMergingFromDetail({ pb: contact, dav: davContact });
    },
    [],
  );

  const handleMergeFromDetail = useCallback(
    async (pbId: string, fieldSelections: MergeFieldSelections) => {
      if (!mergingFromDetail) return;
      try {
        await mergeAndLink(pbId, mergingFromDetail.dav.href, fieldSelections);
        setMergingFromDetail(null);
        refetch();
      } catch (err) {
        console.error("[Link] Failed to merge and link:", err);
      }
    },
    [mergingFromDetail, mergeAndLink, refetch],
  );

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setSelected(null);
    window.history.pushState(null, "", `#${TAB_HASH[tab]}`);
  }, []);

  // ── Tab content (shared across layouts) ────────────────────────────
  const contactsContent = (
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
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      {bulkSelected.size > 0 && (
        <div className="mb-4">
          <BulkActionBar
            selectedCount={bulkSelected.size}
            selectedIds={bulkSelected}
            schema={rawSchema}
            onDone={() => { setBulkSelected(new Set()); refetch(); }}
            onClear={() => setBulkSelected(new Set())}
          />
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
            selectedIds={bulkSelected}
            onToggleSelect={toggleBulkSelect}
            onToggleSelectAll={toggleBulkSelectAll}
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
          onPhotoChange={(uri) => { photoMap[selected.id] = uri; }}
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

      {mergingFromDetail && (
        <LinkMergeDialog
          carddavContact={mergingFromDetail.dav}
          preselectedPbId={mergingFromDetail.pb.id}
          onLink={(pbId, fieldSelections) => handleMergeFromDetail(pbId, fieldSelections)}
          onClose={() => setMergingFromDetail(null)}
        />
      )}

      {editing && (
        <RecordForm
          collection="contacts"
          fields={rawSchema}
          record={editing === "new" ? null : editing}
          onSave={() => {
            setEditing(null);
            refetch();
          }}
          onClose={() => setEditing(null)}
          onDelete={() => { setEditing(null); refetch(); }}
        />
      )}
    </>
  );

  const tabContent = (
    <>
      {activeTab === "contacts" && contactsContent}
      {activeTab === "addresses" && (
        <AddressesPage
          initialAddressId={deepLinkAddressId}
          onAddressViewed={() => setDeepLinkAddressId(null)}
          onContactSelect={handleContactDeepLink}
        />
      )}
      {activeTab === "groups" && <GroupTagsPage />}
      {activeTab === "map" && <MapPage onContactSelect={handleContactDeepLink} onAddressSelect={handleAddressClick} />}
      {activeTab === "carddav" && <CardDavPage />}
      {activeTab === "export" && <ExportPage />}
    </>
  );

  return (
    <>
      <FallingPetals />
      <SidebarLayout activeTab={activeTab} onTabChange={handleTabChange}>
        {tabContent}
      </SidebarLayout>
    </>
  );
}
