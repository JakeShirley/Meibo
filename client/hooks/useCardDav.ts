import { useState, useEffect, useCallback } from "react";
import { carddav, type CardDavContact, type AddressBook } from "../lib/api.ts";

export type { CardDavContact, AddressBook };

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
    carddav.addressBooks()
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
      const data = await carddav.contacts(bookHref);
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
