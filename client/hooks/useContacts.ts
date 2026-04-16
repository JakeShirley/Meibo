import { useState, useEffect, useCallback, useRef } from "react";
import type { Contact } from "../types/contact.ts";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";

const COLLECTION = import.meta.env.VITE_PB_COLLECTION || "contacts";

interface SchemaField {
  name: string;
  type: string;
  options?: { collectionId?: string; maxSelect?: number };
}

interface ExpandedFieldMapping {
  relationField: string;
  subFields: SchemaField[];
}

// Separate "table fields" (condensed) from "detail fields" (all sub-fields)
export interface DisplayFields {
  tableFields: SchemaField[];
  detailFields: SchemaField[];
}

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
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
  const perPage = 25;
  const searchableFields = useRef<string[]>([]);
  const expandFields = useRef<string[]>([]);
  const relationMappings = useRef<ExpandedFieldMapping[]>([]);

  const [schemaReady, setSchemaReady] = useState(false);

  // Fetch collection schema once to discover actual fields
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAuthenticated();
        const col = await pb.send(`/api/collections/${COLLECTION}`, { method: "GET" });
        console.log("[Schema] Collection fields:", col.schema);
        const schema: SchemaField[] = col.schema ?? [];

        // Find relation fields and fetch their schemas
        const relationFields = schema.filter((f) => f.type === "relation");
        const mappings: ExpandedFieldMapping[] = [];
        const expands: string[] = [];

        for (const rel of relationFields) {
          const collectionId = rel.options?.collectionId;
          if (!collectionId) continue;
          try {
            const relCol = await pb.send(`/api/collections/${collectionId}`, { method: "GET" });
            console.log(`[Schema] Related collection for "${rel.name}":`, relCol.name, relCol.schema);
            mappings.push({ relationField: rel.name, subFields: relCol.schema ?? [] });
            expands.push(rel.name);
          } catch (err) {
            console.warn(`[Schema] Could not fetch related collection for "${rel.name}":`, err);
          }
        }

        if (!cancelled) {
          // Table fields: non-relation fields + one composed column per relation
          // Detail fields: non-relation fields + individual sub-fields per relation
          const tableFields: SchemaField[] = [];
          const detailFields: SchemaField[] = [];

          for (const f of schema) {
            if (f.type === "relation") {
              const mapping = mappings.find((m) => m.relationField === f.name);
              if (mapping) {
                // Table gets a single composed column
                tableFields.push({ name: f.name, type: "relation_composed" });
                // Detail gets all individual sub-fields
                for (const sub of mapping.subFields) {
                  detailFields.push({
                    name: `${f.name}.${sub.name}`,
                    type: sub.type,
                  });
                }
              }
            } else {
              tableFields.push(f);
              detailFields.push(f);
            }
          }

          setDisplayFields({ tableFields, detailFields });
          setRawSchema(schema);
          relationMappings.current = mappings;
          expandFields.current = expands;

          const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
          searchableFields.current = tableFields
            .filter((f) => textTypes.has(f.type))
            .map((f) => f.name);
          console.log("[Schema] Searchable fields:", searchableFields.current);
          console.log("[Schema] Expand fields:", expands);
          console.log("[Schema] Table fields:", tableFields.map((f) => f.name));
          console.log("[Schema] Detail fields:", detailFields.map((f) => f.name));

          if (searchableFields.current.length > 0) {
            setSortField(searchableFields.current[0]);
          }
          setSchemaReady(true);
        }
      } catch (err) {
        console.error("[Schema] Failed to fetch schema, using fallback:", err);
        if (!cancelled) {
          searchableFields.current = [];
          setSchemaReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const buildFilter = useCallback((q: string) => {
    if (!q || searchableFields.current.length === 0) return "";
    const escaped = q.replace(/"/g, '\\"');
    return searchableFields.current
      .map((f) => `${f} ~ "${escaped}"`)
      .join(" || ");
  }, []);

  // Flatten expanded relations into dot-notation keys on each contact
  const flattenContacts = useCallback((items: Contact[]): Contact[] => {
    if (expandFields.current.length === 0) return items;
    const SKIP = new Set(["id", "collectionId", "collectionName", "created", "updated", "expand"]);
    return items.map((item) => {
      const flat: Contact = { ...item };
      const expand = (item as Record<string, unknown>).expand as Record<string, Record<string, unknown>> | undefined;
      if (expand) {
        for (const relField of expandFields.current) {
          const related = expand[relField];
          if (related && typeof related === "object" && !Array.isArray(related)) {
            for (const [key, val] of Object.entries(related)) {
              if (!SKIP.has(key) && typeof val !== "object") {
                (flat as Record<string, unknown>)[`${relField}.${key}`] = val;
              }
            }
          }
        }
      }
      return flat;
    });
  }, []);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAuthenticated();
      const sort = sortField
        ? (sortDir === "asc" ? sortField : `-${sortField}`)
        : "";
      const filter = buildFilter(search);
      const expand = expandFields.current.join(",");

      console.log("[Contacts] Fetching page", page, "sort:", sort, "filter:", filter, "expand:", expand);
      const result = await pb
        .collection(COLLECTION)
        .getList<Contact>(page, perPage, {
          ...(sort ? { sort } : {}),
          ...(filter ? { filter } : {}),
          ...(expand ? { expand } : {}),
        });

      console.log("[Contacts] Fetched", result.items.length, "of", result.totalItems, "total");
      setContacts(flattenContacts(result.items));
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (err) {
      console.error("[Contacts] Fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch contacts");
    } finally {
      setLoading(false);
    }
  }, [page, search, sortField, sortDir, buildFilter, flattenContacts]);

  useEffect(() => {
    if (schemaReady) {
      fetchContacts();
    }
  }, [fetchContacts, schemaReady]);

  const fetchAll = useCallback(async (): Promise<Contact[]> => {
    await ensureAuthenticated();
    const sort = sortField
      ? (sortDir === "asc" ? sortField : `-${sortField}`)
      : "";
    const filter = buildFilter(search);
    const expand = expandFields.current.join(",");
    const items = await pb
      .collection(COLLECTION)
      .getFullList<Contact>({
        ...(sort ? { sort } : {}),
        ...(filter ? { filter } : {}),
        ...(expand ? { expand } : {}),
      });
    return flattenContacts(items);
  }, [search, sortField, sortDir, buildFilter, flattenContacts]);

  return {
    collectionName: COLLECTION,
    contacts,
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
    fetchAll,
    refetch: fetchContacts,
  };
}
