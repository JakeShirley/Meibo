import { useState, useEffect, useCallback, useRef } from "react";
import {
  contacts as contactsApi,
  schema as schemaApi,
  type Contact,
  type SchemaField,
} from "../lib/api.ts";

// Separate "table fields" (condensed) from "detail fields" (all sub-fields)
export interface DisplayFields {
  tableFields: SchemaField[];
  detailFields: SchemaField[];
}

export function useContacts() {
  const [items, setItems] = useState<Contact[]>([]);
  const [displayFields, setDisplayFields] = useState<DisplayFields>({ tableFields: [], detailFields: [] });
  const [rawSchema, setRawSchema] = useState<SchemaField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const searchableFields = useRef<string[]>([]);

  const [schemaReady, setSchemaReady] = useState(false);

  // Fetch schema once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fields } = await schemaApi.contacts();

        if (cancelled) return;

        const tableFields: SchemaField[] = [];
        const detailFields: SchemaField[] = [];

        for (const f of fields) {
          if (f.type === "relation") {
            tableFields.push({ ...f, type: "relation_composed" });
            detailFields.push({ ...f, type: "relation_composed" });
          } else {
            tableFields.push(f);
            detailFields.push(f);
          }
        }

        setDisplayFields({ tableFields, detailFields });
        setRawSchema(fields);

        const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
        searchableFields.current = fields
          .filter((f) => textTypes.has(f.type))
          .map((f) => f.name);

        if (searchableFields.current.length > 0) {
          setSortField(searchableFields.current[0]);
        }
        setSchemaReady(true);
      } catch (err) {
        console.error("[Schema] Failed to fetch schema:", err);
        if (!cancelled) {
          searchableFields.current = [];
          setSchemaReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sort = sortField
        ? (sortDir === "asc" ? sortField : `-${sortField}`)
        : "";

      const result = await contactsApi.list({
        page,
        perPage: 25,
        sort,
        search,
      });

      setItems(result.items);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (err) {
      console.error("[Contacts] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch contacts");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortField, sortDir]);

  useEffect(() => {
    if (schemaReady) fetchContacts();
  }, [fetchContacts, schemaReady]);

  return {
    contacts: items,
    displayFields,
    rawSchema,
    loading,
    error,
    page,
    setPage,
    totalPages,
    totalItems,
    search,
    setSearch,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    refetch: fetchContacts,
  };
}
