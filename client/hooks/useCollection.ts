import { useState, useEffect, useCallback, useRef } from "react";
import {
  addresses as addressesApi,
  tags as tagsApi,
  contacts as contactsApi,
  schema as schemaApi,
  type SchemaField,
} from "../lib/api.ts";

type Record = { id: string; [key: string]: unknown };

// Map collection names to API modules
function getApi(name: string) {
  if (name === "contact_addresses") return addressesApi;
  if (name === "group_tags") return tagsApi;
  // Default: treat as contacts
  return contactsApi;
}

function getSchemaApi(name: string) {
  if (name === "contact_addresses") return schemaApi.addresses;
  if (name === "group_tags") return schemaApi.tags;
  return schemaApi.contacts;
}

export function useCollection<T extends Record = Record>(collectionName: string, opts?: { perPage?: number }) {
  const perPage = opts?.perPage ?? 25;
  const [items, setItems] = useState<T[]>([]);
  const [fields, setFields] = useState<SchemaField[]>([]);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fields: schemaFields } = await getSchemaApi(collectionName)();

        if (cancelled) return;

        const displayFields: SchemaField[] = [];
        for (const f of schemaFields) {
          if (f.type === "relation") {
            displayFields.push({ ...f, type: "relation_composed" });
          } else {
            displayFields.push(f);
          }
        }

        setFields(displayFields);
        setRawSchema(schemaFields);

        const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
        searchableFields.current = displayFields
          .filter((f) => textTypes.has(f.type))
          .map((f) => f.name);
        if (searchableFields.current.length > 0) {
          setSortField(searchableFields.current[0]);
        }
        setSchemaReady(true);
      } catch (err) {
        console.error(`[Schema:${collectionName}] Failed:`, err);
        if (!cancelled) {
          searchableFields.current = [];
          setSchemaReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [collectionName]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sort = sortField
        ? (sortDir === "asc" ? sortField : `-${sortField}`)
        : "";
      const api = getApi(collectionName);
      const result = await api.list({
        page,
        perPage,
        sort,
        search,
      });
      setItems(result.items as T[]);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (err) {
      console.error(`[Fetch:${collectionName}] Error:`, err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [collectionName, page, search, sortField, sortDir]);

  useEffect(() => {
    if (schemaReady) fetchItems();
  }, [fetchItems, schemaReady]);

  return {
    collectionName,
    items,
    fields,
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
    refetch: fetchItems,
  };
}
