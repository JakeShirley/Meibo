import { useState, useMemo } from "react";
import { useCardDav, type CardDavContact } from "../hooks/useCardDav.ts";
import { useLinks } from "../hooks/useLinks.ts";
import { carddav as carddavApi } from "../lib/api.ts";
import LinkMergeDialog from "./LinkMergeDialog.tsx";
import CreateCardDavDialog from "./CreateCardDavDialog.tsx";
import type { MergeFieldSelections } from "../lib/api.ts";

export default function CardDavPage() {
  const { books, selectedBook, setSelectedBook, contacts, loading, error, refetch } =
    useCardDav();
  const { links, getPbIdForHref, removeLink, mergeAndLink, linkCreateNew } = useLinks();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<CardDavContact | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sortField, setSortField] = useState<"fn" | "email" | "tel" | "org">("fn");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    const list = contacts.filter((c) => {
      const isLinked = !!getPbIdForHref(c.href);
      if (linkFilter === "linked" && !isLinked) return false;
      if (linkFilter === "unlinked" && isLinked) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.fn.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.tel.toLowerCase().includes(q) ||
        c.org.toLowerCase().includes(q)
      );
    });
    list.sort((a, b) => {
      const av = (a[sortField] || "").toLowerCase();
      const bv = (b[sortField] || "").toLowerCase();
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [contacts, search, linkFilter, sortField, sortDir, getPbIdForHref]);

  const handleLink = async (pbId: string, fieldSelections: MergeFieldSelections) => {
    if (!linking) return;
    setActionError(null);
    try {
      // Single call: server handles PB update + CardDAV sync + link creation
      await mergeAndLink(pbId, linking.href, fieldSelections);
      setLinking(null);
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnlink = async (href: string) => {
    const pbId = getPbIdForHref(href);
    if (!pbId) return;
    try {
      await removeLink(pbId);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (href: string) => {
    setDeleting(true);
    setActionError(null);
    try {
      await carddavApi.deleteContact(href);
      setExpanded(null);
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  };

  const linkedPbIds = useMemo(() => new Set(Object.keys(links)), [links]);

  const handleCreateCardDav = async (contact: { id: string; [key: string]: unknown }) => {
    if (!selectedBook) return;
    setActionError(null);
    try {
      // Single call: server fetches PB contact, creates vCard, saves link
      await linkCreateNew(String(contact.id), selectedBook);
      setCreatingNew(false);
      refetch();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div>
      {/* address book selector */}
      {books.length > 1 && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm font-medium text-text-secondary">
            Address Book:
          </label>
          <select
            value={selectedBook}
            onChange={(e) => setSelectedBook(e.target.value)}
            className="rounded-md border border-input-border bg-surface-alt px-3 py-1.5 text-sm text-text focus:border-input-focus focus:outline-none"
          >
            {books.map((b) => (
              <option key={b.href} value={b.href}>
                {b.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* search + create */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search CardDAV contacts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-input-focus focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setCreatingNew(true)}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover"
        >
          + Create CardDAV Contact
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

      {(error || actionError) && (
        <div className="mb-4 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text">
          {error || actionError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-text-muted">
            {filtered.length} contact{filtered.length !== 1 ? "s" : ""} in{" "}
            {books.find((b) => b.href === selectedBook)?.displayName ||
              "address book"}
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-thead text-text-secondary">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  {(["fn", "email", "tel", "org"] as const).map((col) => {
                    const labels = { fn: "Name", email: "Email", tel: "Phone", org: "Organization" };
                    const arrow = sortField === col ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";
                    return (
                      <th
                        key={col}
                        onClick={() => {
                          if (sortField === col) {
                            setSortDir(sortDir === "asc" ? "desc" : "asc");
                          } else {
                            setSortField(col);
                            setSortDir("asc");
                          }
                        }}
                        className="cursor-pointer select-none px-4 py-3 font-medium hover:bg-surface-hover"
                      >
                        {labels[col]}{arrow}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {filtered.map((c) => {
                  const linkedPbId = getPbIdForHref(c.href);
                  return (
                    <tr
                      key={c.uid}
                      onClick={() =>
                        setExpanded(expanded === c.uid ? null : c.uid)
                      }
                      className="cursor-pointer transition-colors hover:bg-surface-hover"
                    >
                      <td className="px-2 py-3 text-center">
                        {linkedPbId ? (
                          <span title="Linked to Meibo" className="text-primary">🔗</span>
                        ) : (
                          <span className="text-text-muted opacity-30">○</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-text">
                        <div className="flex items-center gap-2">
                          {c.photoUri ? (
                            <img src={c.photoUri} alt="" className="h-7 w-7 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-light text-xs font-bold text-primary-text">
                              {(c.fn || "?")[0]}
                            </span>
                          )}
                          {c.fn || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {c.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {c.tel || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {c.org || "—"}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-text-muted"
                    >
                      No contacts found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Expanded vCard detail panel */}
          {expanded && (
            <VCardDetail
              contact={filtered.find((c) => c.uid === expanded)!}
              linkedPbId={getPbIdForHref(filtered.find((c) => c.uid === expanded)?.href || "")}
              onClose={() => setExpanded(null)}
              onLink={(c) => { setExpanded(null); setLinking(c); }}
              onUnlink={(href) => handleUnlink(href)}
              onDelete={(href) => handleDelete(href)}
              deleting={deleting}
            />
          )}
        </>
      )}

      {/* Link/Merge dialog */}
      {linking && (
        <LinkMergeDialog
          carddavContact={linking}
          onLink={handleLink}
          onClose={() => setLinking(null)}
        />
      )}

      {/* Create new CardDAV contact dialog */}
      {creatingNew && (
        <CreateCardDavDialog
          linkedPbIds={linkedPbIds}
          onConfirm={handleCreateCardDav}
          onClose={() => setCreatingNew(false)}
        />
      )}
    </div>
  );
}

function VCardDetail({
  contact,
  linkedPbId,
  onClose,
  onLink,
  onUnlink,
  onDelete,
  deleting,
}: {
  contact: CardDavContact;
  linkedPbId: string | undefined;
  onClose: () => void;
  onLink: (c: CardDavContact) => void;
  onUnlink: (href: string) => void;
  onDelete: (href: string) => void;
  deleting?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!contact) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface-alt p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-text-muted hover:text-text"
        >
          ✕
        </button>

        <div className="mb-1 flex items-center gap-3">
          {contact.photoUri ? (
            <img src={contact.photoUri} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-light text-xl font-bold text-primary-text">
              {(contact.fn || "?")[0]}
            </span>
          )}
          <div>
            <h2 className="text-lg font-semibold text-text">
              {contact.fn || "Unnamed"}
            </h2>
          {linkedPbId && (
            <span className="rounded-full bg-primary-light px-2 py-0.5 text-xs font-medium text-primary-text">
              🔗 Linked
            </span>
          )}
          </div>
        </div>
        <p className="mb-4 text-sm text-text-muted">{contact.href}</p>

        <dl className="mb-4 space-y-2">
          {contact.email && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Email</dt>
              <dd className="text-sm text-text">{contact.email}</dd>
            </div>
          )}
          {contact.tel && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Phone</dt>
              <dd className="text-sm text-text">{contact.tel}</dd>
            </div>
          )}
          {contact.org && (
            <div>
              <dt className="text-xs font-medium text-text-muted">
                Organization
              </dt>
              <dd className="text-sm text-text">{contact.org}</dd>
            </div>
          )}
          {(contact.adrStreet || contact.adrCity) && (
            <div>
              <dt className="text-xs font-medium text-text-muted">Address</dt>
              <dd className="text-sm text-text">
                {[contact.adrStreet, contact.adrCity, contact.adrState, contact.adrZip, contact.adrCountry].filter(Boolean).join(", ")}
              </dd>
            </div>
          )}
        </dl>

        <details className="group mb-4">
          <summary className="cursor-pointer text-xs font-medium text-text-muted group-open:mb-2">
            Raw vCard
          </summary>
          <pre className="overflow-x-auto rounded-md bg-surface p-3 text-xs text-text-secondary">
            {contact.raw.replace(/^PHOTO[;:][\s\S]*?(?=\r?\n[A-Z])/im, "PHOTO:(binary data omitted)")}
          </pre>
        </details>

        <div className="flex items-center justify-between">
          <div>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-danger">Delete this contact?</span>
                <button
                  type="button"
                  onClick={() => onDelete(contact.href)}
                  disabled={deleting}
                  className="rounded-md bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger/80 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm font-medium text-danger hover:underline"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {linkedPbId ? (
              <button
                type="button"
                onClick={() => onUnlink(contact.href)}
                className="rounded-md border border-danger-border px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-bg"
              >
                Unlink
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onLink(contact)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-hover"
              >
                🔗 Link to Contact
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
