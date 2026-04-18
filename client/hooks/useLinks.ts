import { useState, useEffect, useCallback } from "react";

/** pbId → carddavHref */
export type LinkMap = Record<string, string>;

export function useLinks() {
  const [links, setLinks] = useState<LinkMap>({});

  const fetchLinks = useCallback(async () => {
    try {
      const res = await fetch("/api/carddav/links");
      if (res.ok) setLinks(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const createLink = useCallback(async (pbId: string, carddavHref: string) => {
    const res = await fetch("/api/carddav/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pbId, carddavHref }),
    });
    if (!res.ok) throw new Error("Failed to create link");
    await fetchLinks();
  }, [fetchLinks]);

  const removeLink = useCallback(async (pbId: string) => {
    const res = await fetch(`/api/carddav/links/${encodeURIComponent(pbId)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to remove link");
    await fetchLinks();
  }, [fetchLinks]);

  const syncToRadicale = useCallback(async (
    carddavHref: string,
    fields: { fn?: string; firstName?: string; lastName?: string; email?: string; tel?: string; org?: string },
    existingRaw?: string,
    etag?: string,
  ) => {
    const res = await fetch("/api/carddav/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carddavHref, fields, existingRaw, etag }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Sync failed" }));
      throw new Error(data.error || "Sync failed");
    }
  }, []);

  // Helper lookups
  const getHrefForPbId = useCallback((pbId: string) => links[pbId], [links]);
  const getPbIdForHref = useCallback((href: string) => {
    for (const [pbId, h] of Object.entries(links)) {
      if (h === href) return pbId;
    }
    return undefined;
  }, [links]);

  return { links, createLink, removeLink, syncToRadicale, getHrefForPbId, getPbIdForHref, refetch: fetchLinks };
}
