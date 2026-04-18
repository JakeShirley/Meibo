import { useState, useMemo } from "react";
import type { CardDavContact } from "../hooks/useCardDav.ts";
import type { Contact } from "../types/contact.ts";

interface Props {
  contact: Contact;
  davContacts: CardDavContact[];
  books: { href: string; displayName: string }[];
  selectedBook: string;
  onLinkExisting: (contact: Contact, davContact: CardDavContact) => void;
  onCreateNew: (contact: Contact) => void;
  onClose: () => void;
}

export default function LinkFromDetailDialog({
  contact,
  davContacts,
  books,
  selectedBook,
  onLinkExisting,
  onCreateNew,
  onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "this contact";

  const filtered = useMemo(() => {
    if (!search.trim()) return davContacts;
    const q = search.toLowerCase();
    return davContacts.filter(
      (c) =>
        c.fn.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.tel.toLowerCase().includes(q),
    );
  }, [davContacts, search]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-alt p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-text-muted hover:text-text"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="mb-1 text-lg font-bold text-text">Link to CardDAV</h2>
        <p className="mb-4 text-sm text-text-muted">
          Link{" "}
          <span className="font-medium text-primary">{contactName}</span> to an
          existing CardDAV contact or create a new one.
        </p>

        {/* Create new button */}
        <button
          onClick={() => {
            setCreating(true);
            onCreateNew(contact);
          }}
          disabled={creating}
          className="mb-4 flex w-full items-center gap-2 rounded-lg border border-dashed border-primary/40 px-4 py-3 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {creating ? "Creating…" : `Create new CardDAV contact${books.length > 1 ? ` in ${books.find((b) => b.href === selectedBook)?.displayName ?? "address book"}` : ""}`}
        </button>

        {/* Divider */}
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-muted">or link to existing</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search CardDAV contacts…"
          className="mb-3 w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-input-focus focus:outline-none"
        />

        {/* Results */}
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            {search.trim() ? `No CardDAV contacts match "${search}"` : "No CardDAV contacts available"}
          </p>
        ) : (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {filtered.map((c) => (
              <button
                key={c.href}
                onClick={() => onLinkExisting(contact, c)}
                className="flex w-full items-center gap-3 border-b border-border-light px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
              >
                {c.photoUri && (
                  <img src={c.photoUri} alt="" className="h-8 w-8 rounded-full object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-text">{c.fn || "Unnamed"}</p>
                  <p className="truncate text-xs text-text-muted">
                    {[c.email, c.tel].filter(Boolean).join(" · ") || "No email/phone"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-primary">Link →</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
