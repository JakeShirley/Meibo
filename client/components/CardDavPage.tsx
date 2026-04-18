import { useState } from "react";
import { useCardDav, type CardDavContact } from "../hooks/useCardDav.ts";
import { useLinks } from "../hooks/useLinks.ts";
import LinkMergeDialog, { type MergedFields } from "./LinkMergeDialog.tsx";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";

const COLLECTION = import.meta.env.VITE_PB_COLLECTION || "contacts";

export default function CardDavPage() {
  const { books, selectedBook, setSelectedBook, contacts, loading, error, refetch } =
    useCardDav();
  const { getPbIdForHref, createLink, removeLink, syncToRadicale } = useLinks();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState<CardDavContact | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = search
    ? contacts.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.fn.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.tel.toLowerCase().includes(q) ||
          c.org.toLowerCase().includes(q)
        );
      })
    : contacts;

  const handleLink = async (pbId: string, merged: MergedFields) => {
    if (!linking) return;
    setActionError(null);
    try {
      // Normalize phone: strip country code, keep only digits, then format as XXX-XXX-XXXX
      const digits = merged.phone_number.replace(/^\+1/, "").replace(/\D/g, "");
      const pbPhone = digits.length === 10
        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
        : digits.length === 7
          ? `${digits.slice(0, 3)}-${digits.slice(3)}`
          : merged.phone_number; // leave as-is if unexpected length

      // 1. Update PocketBase contact
      await ensureAuthenticated();
      await pb.collection(COLLECTION).update(pbId, {
        first_name: merged.first_name,
        last_name: merged.last_name,
        email: merged.email,
        phone_number: pbPhone,
      });

      // 2. Update Radicale vCard — parse address back to components
      const addrSource = merged.address;
      // If address came from CardDAV, use the original structured fields; otherwise parse the comma string
      const useOriginalAddr = addrSource === [linking.adrStreet, linking.adrCity, linking.adrState, linking.adrZip, linking.adrCountry].filter(Boolean).join(", ");
      let adrStreet = "", adrCity = "", adrState = "", adrZip = "", adrCountry = "";
      if (useOriginalAddr) {
        adrStreet = linking.adrStreet;
        adrCity = linking.adrCity;
        adrState = linking.adrState;
        adrZip = linking.adrZip;
        adrCountry = linking.adrCountry;
      } else if (addrSource) {
        // Best-effort parse: street, city, state, zip, country
        const parts = addrSource.split(",").map((s: string) => s.trim());
        adrStreet = parts[0] || "";
        adrCity = parts[1] || "";
        adrState = parts[2] || "";
        adrZip = parts[3] || "";
        adrCountry = parts[4] || "";
      }

      await syncToRadicale(
        linking.href,
        {
          fn: `${merged.first_name} ${merged.last_name}`.trim(),
          firstName: merged.first_name,
          lastName: merged.last_name,
          email: merged.email,
          tel: merged.phone_number,
          adrStreet,
          adrCity,
          adrState,
          adrZip,
          adrCountry,
        },
        linking.raw,
        linking.etag,
      );

      // 3. Store the link
      await createLink(pbId, linking.href);

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

      {/* search */}
      <div className="mb-4 w-full sm:w-72">
        <input
          type="text"
          placeholder="Search CardDAV contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-input-focus focus:outline-none"
        />
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
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
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
                          <span title="Linked to Contact Book" className="text-primary">🔗</span>
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
    </div>
  );
}

function VCardDetail({
  contact,
  linkedPbId,
  onClose,
  onLink,
  onUnlink,
}: {
  contact: CardDavContact;
  linkedPbId: string | undefined;
  onClose: () => void;
  onLink: (c: CardDavContact) => void;
  onUnlink: (href: string) => void;
}) {
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

        <div className="flex justify-end gap-2">
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
  );
}
