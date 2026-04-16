import { useState, useEffect, useCallback, useRef } from "react";
import pb, { ensureAuthenticated } from "../lib/pocketbase.ts";

interface SchemaField {
  name: string;
  type: string;
  options?: { collectionId?: string };
}

interface ExpandedFieldMapping {
  relationField: string;
  subFields: SchemaField[];
}

type Record = { id: string; [key: string]: unknown };

export function useCollection<T extends Record = Record>(collectionName: string) {
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
  const perPage = 25;
  const searchableFields = useRef<string[]>([]);
  const expandFields = useRef<string[]>([]);
  const relationMappingsRef = useRef<ExpandedFieldMapping[]>([]);
  const [schemaReady, setSchemaReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureAuthenticated();
        const col = await pb.send(`/api/collections/${collectionName}`, { method: "GET" });
        const schema: SchemaField[] = col.schema ?? [];

        // Discover relation fields and fetch their schemas
        const relationFields = schema.filter((f) => f.type === "relation");
        const mappings: ExpandedFieldMapping[] = [];
        const expands: string[] = [];

        for (const rel of relationFields) {
          const collectionId = rel.options?.collectionId;
          if (!collectionId) continue;
          try {
            const relCol = await pb.send(`/api/collections/${collectionId}`, { method: "GET" });
            mappings.push({ relationField: rel.name, subFields: relCol.schema ?? [] });
            expands.push(rel.name);
          } catch {
            // skip if related collection is inaccessible
          }
        }

        if (!cancelled) {
          // Build display fields: non-relation + composed relation column
          const displayFields: SchemaField[] = [];
          for (const f of schema) {
            if (f.type === "relation") {
              const mapping = mappings.find((m) => m.relationField === f.name);
              if (mapping) {
                displayFields.push({ name: f.name, type: "relation_composed" });
              }
            } else {
              displayFields.push(f);
            }
          }

          setFields(displayFields);
          setRawSchema(schema);
          expandFields.current = expands;
          relationMappingsRef.current = mappings;

          const textTypes = new Set(["text", "email", "url", "editor", "plain"]);
          searchableFields.current = displayFields
            .filter((f) => textTypes.has(f.type))
            .map((f) => f.name);
          if (searchableFields.current.length > 0) {
            setSortField(searchableFields.current[0]);
          }
          setSchemaReady(true);
        }
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

  const buildFilter = useCallback((q: string) => {
    if (!q || searchableFields.current.length === 0) return "";
    const escaped = q.replace(/"/g, '\\"');
    return searchableFields.current
      .map((f) => `${f} ~ "${escaped}"`)
      .join(" || ");
  }, []);

  const flattenItems = useCallback((raw: T[]): T[] => {
    if (expandFields.current.length === 0) return raw;
    const TEXT_TYPES = new Set(["text", "email", "url"]);

    // Build a set of display-worthy field names per relation
    const displayKeysMap = new Map<string, Set<string>>();
    for (const mapping of relationMappingsRef.current) {
      const keys = new Set<string>();
      for (const sub of mapping.subFields) {
        if (TEXT_TYPES.has(sub.type)) {
          keys.add(sub.name);
        }
      }
      displayKeysMap.set(mapping.relationField, keys);
    }

    const summarizeRecord = (rec: globalThis.Record<string, unknown>, allowedKeys: Set<string>): string => {
      const parts: string[] = [];
      for (const key of allowedKeys) {
        const val = rec[key];
        if (val) parts.push(String(val));
      }
      return parts.join(" ");
    };

    return raw.map((item) => {
      const flat = { ...item } as Record;
      const expand = (item as Record).expand as globalThis.Record<string, unknown> | undefined;
      if (expand) {
        for (const relField of expandFields.current) {
          const related = expand[relField];
          const allowedKeys = displayKeysMap.get(relField) ?? new Set<string>();
          if (allowedKeys.size === 0) continue;

          if (Array.isArray(related)) {
            flat[relField] = related
              .map((r) => summarizeRecord(r as globalThis.Record<string, unknown>, allowedKeys))
              .filter(Boolean)
              .join("; ") || flat[relField];
          } else if (related && typeof related === "object") {
            flat[relField] = summarizeRecord(related as globalThis.Record<string, unknown>, allowedKeys) || flat[relField];
          }
        }
      }
      return flat as T;
    });
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await ensureAuthenticated();
      const sort = sortField
        ? (sortDir === "asc" ? sortField : `-${sortField}`)
        : "";
      const filter = buildFilter(search);
      const expand = expandFields.current.join(",");
      const result = await pb
        .collection(collectionName)
        .getList<T>(page, perPage, {
          ...(sort ? { sort } : {}),
          ...(filter ? { filter } : {}),
          ...(expand ? { expand } : {}),
        });
      setItems(flattenItems(result.items));
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (err) {
      console.error(`[Fetch:${collectionName}] Error:`, err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [collectionName, page, search, sortField, sortDir, buildFilter, flattenItems]);

  useEffect(() => {
    if (schemaReady) fetchItems();
  }, [fetchItems, schemaReady]);

  const fetchAll = useCallback(async (): Promise<T[]> => {
    await ensureAuthenticated();
    const sort = sortField
      ? (sortDir === "asc" ? sortField : `-${sortField}`)
      : "";
    const filter = buildFilter(search);
    const expand = expandFields.current.join(",");
    return flattenItems(await pb
      .collection(collectionName)
      .getFullList<T>({
        ...(sort ? { sort } : {}),
        ...(filter ? { filter } : {}),
        ...(expand ? { expand } : {}),
      }));
  }, [collectionName, search, sortField, sortDir, buildFilter, flattenItems]);

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
    fetchAll,
    refetch: fetchItems,
  };
}
