import { useState, useEffect } from "react";
import { contacts as contactsApi, type MergeFieldSelections, type Contact } from "../lib/api.ts";
import type { CardDavContact } from "../hooks/useCardDav.ts";

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function formatBirthday(month: number, day: number, year: number): string {
  if (!month || !day) return "";
  const m = MONTH_NAMES[month] || String(month);
  return year ? `${day} ${m} ${year}` : `${day} ${m}`;
}

interface Props {
  carddavContact: CardDavContact;
  preselectedPbId?: string;
  onLink: (pbId: string, fieldSelections: MergeFieldSelections) => void;
  onClose: () => void;
}

type FieldSource = "pb" | "carddav";

export default function LinkMergeDialog({ carddavContact, preselectedPbId, onLink, onClose }: Props) {
  const [step, setStep] = useState<"search" | "merge">(preselectedPbId ? "merge" : "search");
  const [query, setQuery] = useState(carddavContact.fn || "");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPb, setSelectedPb] = useState<Contact | null>(null);

  // Auto-load preselected PB contact
  useEffect(() => {
    if (!preselectedPbId) return;
    (async () => {
      try {
        const contact = await contactsApi.get(preselectedPbId);
        setSelectedPb(contact);
      } catch {
        // Fall back to search step
        setStep("search");
      }
    })();
  }, [preselectedPbId]);

  // Field sources for merge step
  const [sources, setSources] = useState<Record<string, FieldSource>>({
    first_name: "carddav",
    last_name: "carddav",
    email: "carddav",
    phone_number: "carddav",
    address: "carddav",
    birthday: "carddav",
  });

  // Search contacts via new API
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await contactsApi.list({
          page: 1,
          perPage: 20,
          search: query,
          sort: "first_name",
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

  interface MergedFieldValues {
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string;
    address: string;
    birthday: string;
  }

  const davValues: MergedFieldValues = {
    first_name: davFirstName,
    last_name: davLastName,
    email: carddavContact.email,
    phone_number: carddavContact.tel,
    address: davAddress,
    birthday: davBirthday,
  };

  const getPbAddress = (c: Contact): string => {
    // Server flattens expanded relations to dot-notation
    const parts = [
      c["current_address.address_street"],
      c["current_address.address_secondary"],
      c["current_address.address_city"],
      c["current_address.address_state"],
      c["current_address.address_zip"],
      c["current_address.address_country"],
    ].filter(Boolean).map(String);
    return parts.join(", ");
  };

  const getPbBirthday = (c: Contact): string => {
    const m = Number(c.birthday_month ?? 0);
    const d = Number(c.birthday_day ?? 0);
    const y = Number(c.birthday_year ?? 0);
    return formatBirthday(m, d, y);
  };

  const pbValues: MergedFieldValues = selectedPb ? {
    first_name: String(selectedPb.first_name ?? ""),
    last_name: String(selectedPb.last_name ?? ""),
    email: String(selectedPb.email ?? ""),
    phone_number: String(selectedPb.phone_number ?? ""),
    address: getPbAddress(selectedPb),
    birthday: getPbBirthday(selectedPb),
  } : { first_name: "", last_name: "", email: "", phone_number: "", address: "", birthday: "" };

  const getMergedValue = (field: keyof MergedFieldValues) =>
    sources[field] === "pb" ? pbValues[field] : davValues[field];

  const handleSelectPb = (contact: Contact) => {
    setSelectedPb(contact);
    const newSources: Record<string, FieldSource> = {};
    for (const field of ["first_name", "last_name", "email", "phone_number", "address", "birthday"] as const) {
      const davVal = davValues[field];
      const pbVal = field === "address" ? getPbAddress(contact) : field === "birthday" ? getPbBirthday(contact) : String(contact[field] ?? "");
      if (pbVal && !davVal) newSources[field] = "pb";
      else if (!pbVal && davVal) newSources[field] = "carddav";
      else newSources[field] = "pb";
    }
    setSources(newSources);
    setStep("merge");
  };

  const handleConfirmMerge = () => {
    if (!selectedPb) return;
    // Send field selections to server — server does the actual merge
    const fieldSelections: MergeFieldSelections = {
      first_name: sources.first_name as "pb" | "carddav",
      last_name: sources.last_name as "pb" | "carddav",
      email: sources.email as "pb" | "carddav",
      phone_number: sources.phone_number as "pb" | "carddav",
      address: sources.address as "pb" | "carddav",
      birthday: sources.birthday as "pb" | "carddav",
    };
    onLink(String(selectedPb.id), fieldSelections);
  };

  const mergeFields: { key: keyof MergedFieldValues; label: string }[] = [
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
              Linking <span className="font-medium text-primary">{carddavContact.fn || "Unnamed"}</span> — search for a Meibo contact to link to:
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
              Choose which value to keep for each field. The merged result will be saved to both Meibo and Radicale.
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
                          <span className="mb-0.5 block text-[10px] font-bold uppercase text-text-muted">Meibo</span>
                          {pbv || <span className="italic text-text-muted">empty</span>}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSources((s) => ({ ...s, [key]: "carddav" }))}
                          className={`flex-1 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                            sources[key] === "carddav"
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
