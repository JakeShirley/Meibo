import { useState, useEffect } from "react";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";
import type { Contact } from "../types/contact.ts";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const COLLECTION = import.meta.env.VITE_PB_COLLECTION || "contacts";

interface Props {
  linkedPbIds: Set<string>;
  onConfirm: (contact: Contact) => void;
  onClose: () => void;
}

export default function CreateCardDavDialog({ linkedPbIds, onConfirm, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);

  // Search PocketBase contacts (debounced)
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        await ensureAuthenticated();
        const filter = query
          .split(/\s+/)
          .filter(Boolean)
          .map((w) => `(first_name ~ "${w}" || last_name ~ "${w}" || email ~ "${w}" || phone_number ~ "${w}")`)
          .join(" && ");
        const res = await pb.collection(COLLECTION).getList<Contact>(1, 20, {
          filter: filter || undefined,
          sort: "first_name",
          expand: "current_address",
        });
        // Filter out contacts that are already linked
        setResults(res.items.filter((c) => !linkedPbIds.has(String(c.id))));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, linkedPbIds]);

  const getPbAddress = (c: Contact): { street: string; city: string; state: string; zip: string; country: string; display: string } => {
    const exp = (c as Record<string, unknown>).expand as Record<string, Record<string, unknown>> | undefined;
    const addr = exp?.current_address;
    if (!addr) return { street: "", city: "", state: "", zip: "", country: "", display: "" };
    const street = String(addr.address_street ?? "");
    const city = String(addr.address_city ?? "");
    const state = String(addr.address_state ?? "");
    const zip = String(addr.address_zip ?? "");
    const country = String(addr.address_country ?? "");
    return { street, city, state, zip, country, display: [street, city, state, zip, country].filter(Boolean).join(", ") };
  };

  const handleCreate = async () => {
    if (!selected) return;
    onConfirm(selected);
  };

  const previewFields = selected ? (() => {
    const firstName = String(selected.first_name ?? "");
    const lastName = String(selected.last_name ?? "");
    const email = String(selected.email ?? "");
    const phone = String(selected.phone_number ?? "");
    const addr = getPbAddress(selected);
    const bdayMonth = Number(selected.birthday_month ?? 0);
    const bdayDay = Number(selected.birthday_day ?? 0);
    const bdayYear = Number(selected.birthday_year ?? 0);
    const bday = bdayMonth && bdayDay
      ? `${bdayDay} ${MONTH_NAMES[bdayMonth]}${bdayYear ? ` ${bdayYear}` : ""}`
      : "";
    return [
      { label: "First Name", value: firstName },
      { label: "Last Name", value: lastName },
      { label: "Email", value: email },
      { label: "Phone", value: phone },
      { label: "Address", value: addr.display },
      { label: "Birthday", value: bday },
    ];
  })() : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface-alt p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-text-muted hover:text-text"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {!selected ? (
          <>
            <h2 className="mb-1 text-lg font-bold text-text">
              Create CardDAV Contact
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              Search for a Contact Book contact to push to your CardDAV address book. Already-linked contacts are excluded.
            </p>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts…"
              autoFocus
              className="mb-4 w-full rounded-md border border-input-border bg-surface-alt px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-input-focus focus:outline-none"
            />

            {searching && (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            )}

            {!searching && results.length === 0 && query.trim() && (
              <p className="py-4 text-center text-sm text-text-muted">
                No unlinked contacts found for "{query}"
              </p>
            )}

            {!searching && results.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="flex w-full items-center gap-3 border-b border-border-light px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-hover"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-text">
                        {String(c.first_name ?? "")} {String(c.last_name ?? "")}
                      </p>
                      <p className="text-xs text-text-muted">
                        {[c.email, c.phone_number].filter(Boolean).join(" · ") || "No email/phone"}
                      </p>
                    </div>
                    <span className="text-xs text-primary">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="mb-1 text-lg font-bold text-text">
              Confirm New CardDAV Contact
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              A new vCard will be created in your CardDAV address book with the following data from Contact Book:
            </p>

            <div className="mb-4 space-y-3">
              {previewFields.map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <p className="mb-1 text-xs font-semibold text-text-muted uppercase">{label}</p>
                  <p className="text-sm text-text">
                    {value || <span className="italic text-text-muted">empty</span>}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Create & Link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
