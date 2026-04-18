import { useState, useEffect } from "react";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";
import type { CardDavContact } from "../hooks/useCardDav.ts";
import type { Contact } from "../types/contact.ts";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatBirthday(month: number, day: number, year: number): string {
  if (!month || !day) return "";
  const m = MONTH_NAMES[month] || String(month);
  return year ? `${day} ${m} ${year}` : `${day} ${m}`;
}

const COLLECTION = import.meta.env.VITE_PB_COLLECTION || "contacts";

interface Props {
  carddavContact: CardDavContact;
  onLink: (pbId: string, merged: MergedFields) => void;
  onClose: () => void;
}

export interface MergedFields {
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  address: string;
  birthday: string;
}

type FieldSource = "pb" | "dav";

export default function LinkMergeDialog({ carddavContact, onLink, onClose }: Props) {
  const [step, setStep] = useState<"search" | "merge">("search");
  const [query, setQuery] = useState(carddavContact.fn || "");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPb, setSelectedPb] = useState<Contact | null>(null);

  // Field sources for merge step
  const [sources, setSources] = useState<Record<string, FieldSource>>({
    first_name: "dav",
    last_name: "dav",
    email: "dav",
    phone_number: "dav",
    address: "dav",
    birthday: "dav",
  });

  // Search PocketBase contacts
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
        setResults(res.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Parse CardDAV first/last from the raw vCard N field or FN
  const davFirstName = (() => {
    const nMatch = carddavContact.raw.match(/^N(?:;[^:]*)?:([^;\r\n]*);([^;\r\n]*)/im);
    if (nMatch) return nMatch[2]?.trim() || "";
    // Fall back: first word of FN
    return carddavContact.fn.split(/\s+/)[0] || "";
  })();
  const davLastName = (() => {
    const nMatch = carddavContact.raw.match(/^N(?:;[^:]*)?:([^;\r\n]*);([^;\r\n]*)/im);
    if (nMatch) return nMatch[1]?.trim() || "";
    const parts = carddavContact.fn.split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  })();

  const davAddress = [carddavContact.adrStreet, carddavContact.adrCity, carddavContact.adrState, carddavContact.adrZip, carddavContact.adrCountry].filter(Boolean).join(", ");

  const davBirthday = formatBirthday(carddavContact.bdayMonth, carddavContact.bdayDay, carddavContact.bdayYear);

  const davValues: MergedFields = {
    first_name: davFirstName,
    last_name: davLastName,
    email: carddavContact.email,
    phone_number: carddavContact.tel,
    address: davAddress,
    birthday: davBirthday,
  };

  const getPbAddress = (c: Contact): string => {
    const exp = (c as Record<string, unknown>).expand as Record<string, Record<string, unknown>> | undefined;
    const addr = exp?.current_address;
    if (!addr) return "";
    return [addr.address_street, addr.address_city, addr.address_state, addr.address_zip, addr.address_country]
      .filter(Boolean).map(String).join(", ");
  };

  const getPbBirthday = (c: Contact): string => {
    const m = Number(c.birthday_month ?? 0);
    const d = Number(c.birthday_day ?? 0);
    const y = Number(c.birthday_year ?? 0);
    return formatBirthday(m, d, y);
  };

  const pbValues: MergedFields = selectedPb ? {
    first_name: String(selectedPb.first_name ?? ""),
    last_name: String(selectedPb.last_name ?? ""),
    email: String(selectedPb.email ?? ""),
    phone_number: String(selectedPb.phone_number ?? ""),
    address: getPbAddress(selectedPb),
    birthday: getPbBirthday(selectedPb),
  } : { first_name: "", last_name: "", email: "", phone_number: "", address: "", birthday: "" };

  const getMergedValue = (field: keyof MergedFields) =>
    sources[field] === "pb" ? pbValues[field] : davValues[field];

  const handleSelectPb = (contact: Contact) => {
    setSelectedPb(contact);
    // Auto-pick best source per field
    const newSources: Record<string, FieldSource> = {};
    for (const field of ["first_name", "last_name", "email", "phone_number", "address", "birthday"] as const) {
      const pb = pbValues.first_name; // just for type; actual logic below
      void pb;
      const davVal = davValues[field];
      const pbVal = String(contact[field] ?? "");
      // Prefer whichever has a value; if both have values, prefer PB (existing data)
      if (pbVal && !davVal) newSources[field] = "pb";
      else if (!pbVal && davVal) newSources[field] = "dav";
      else newSources[field] = "pb"; // default to PB when both have data
    }
    setSources(newSources);
    setStep("merge");
  };

  const handleConfirmMerge = () => {
    if (!selectedPb) return;
    const merged: MergedFields = {
      first_name: getMergedValue("first_name"),
      last_name: getMergedValue("last_name"),
      email: getMergedValue("email"),
      phone_number: getMergedValue("phone_number"),
      address: getMergedValue("address"),
      birthday: getMergedValue("birthday"),
    };
    onLink(String(selectedPb.id), merged);
  };

  const mergeFields: { key: keyof MergedFields; label: string }[] = [
    { key: "first_name", label: "First Name" },
    { key: "last_name", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone_number", label: "Phone" },
    { key: "address", label: "Address" },
    { key: "birthday", label: "Birthday" },
  ];

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

        {step === "search" && (
          <>
            <h2 className="mb-1 text-lg font-bold text-text">
              Link CardDAV Contact
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              Linking <span className="font-medium text-primary">{carddavContact.fn || "Unnamed"}</span> — search for a Contact Book contact to link to:
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
                No contacts found for "{query}"
              </p>
            )}

            {!searching && results.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                {results.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectPb(c)}
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
        )}

        {step === "merge" && selectedPb && (
          <>
            <h2 className="mb-1 text-lg font-bold text-text">
              Merge & Link
            </h2>
            <p className="mb-4 text-sm text-text-muted">
              Choose which value to keep for each field. The merged result will be saved to both Contact Book and Radicale.
            </p>

            <div className="mb-4 space-y-3">
              {mergeFields.map(({ key, label }) => {
                const dav = davValues[key];
                const pbv = pbValues[key];
                const same = dav === pbv;
                return (
                  <div key={key} className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-semibold text-text-muted uppercase">{label}</p>
                    {same ? (
                      <p className="text-sm text-text">{dav || <span className="text-text-muted italic">empty</span>}</p>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSources((s) => ({ ...s, [key]: "pb" }))}
                          className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            sources[key] === "pb"
                              ? "border-primary bg-primary-light font-medium text-primary-text"
                              : "border-border text-text-secondary hover:border-input-focus"
                          }`}
                        >
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-text-muted">Contact Book</span>
                          {pbv || <span className="italic text-text-muted">empty</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSources((s) => ({ ...s, [key]: "dav" }))}
                          className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            sources[key] === "dav"
                              ? "border-primary bg-primary-light font-medium text-primary-text"
                              : "border-border text-text-secondary hover:border-input-focus"
                          }`}
                        >
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-text-muted">CardDAV</span>
                          {dav || <span className="italic text-text-muted">empty</span>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview */}
            <div className="mb-4 rounded-lg border border-primary bg-primary-light p-3">
              <p className="mb-1 text-xs font-semibold text-primary-text uppercase">Merged Result</p>
              <p className="text-sm text-text">
                {getMergedValue("first_name")} {getMergedValue("last_name")}
                {getMergedValue("email") ? ` · ${getMergedValue("email")}` : ""}
                {getMergedValue("phone_number") ? ` · ${getMergedValue("phone_number")}` : ""}
              </p>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => { setStep("search"); setSelectedPb(null); }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-hover"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
              >
                Link & Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
