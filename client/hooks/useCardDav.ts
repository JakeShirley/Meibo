import { useState, useEffect, useCallback } from "react";

export interface CardDavContact {
  uid: string;
  href: string;
  etag: string;
  fn: string;
  email: string;
  tel: string;
  org: string;
  photoUri: string;
  adrStreet: string;
  adrCity: string;
  adrState: string;
  adrZip: string;
  adrCountry: string;
  raw: string;
}

export interface AddressBook {
  href: string;
  displayName: string;
}

export function useCardDav() {
  const [books, setBooks] = useState<AddressBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<string>("");
  const [contacts, setContacts] = useState<CardDavContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discover address books
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/carddav/address-books")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(data.error || res.statusText);
        }
        return res.json() as Promise<AddressBook[]>;
      })
      .then((data) => {
        if (cancelled) return;
        setBooks(data);
        if (data.length > 0 && !selectedBook) {
          setSelectedBook(data[0].href);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch contacts when book changes
  const fetchContacts = useCallback(async (bookHref: string) => {
    if (!bookHref) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/carddav/contacts?book=${encodeURIComponent(bookHref)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(data.error || res.statusText);
      }
      const data: CardDavContact[] = await res.json();
      setContacts(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBook) fetchContacts(selectedBook);
  }, [selectedBook, fetchContacts]);

  return {
    books,
    selectedBook,
    setSelectedBook,
    contacts,
    loading,
    error,
    refetch: () => { if (selectedBook) fetchContacts(selectedBook); },
  };
}
