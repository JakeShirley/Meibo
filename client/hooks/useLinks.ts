import { useState, useEffect, useCallback } from "react";
import { contacts as contactsApi, carddav, type MergeFieldSelections } from "../lib/api.ts";

/** pbId → carddavHref */
export type LinkMap = Record<string, string>;

export function useLinks() {
  const [links, setLinks] = useState<LinkMap>({});

  const fetchLinks = useCallback(async () => {
    try {
      const data = await carddav.links();
      setLinks(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const linkToExisting = useCallback(async (pbId: string, carddavHref: string) => {
    await contactsApi.link(pbId, carddavHref);
    await fetchLinks();
  }, [fetchLinks]);

  const linkCreateNew = useCallback(async (pbId: string, book: string) => {
    const result = await contactsApi.linkCreate(pbId, book);
    await fetchLinks();
    return result;
  }, [fetchLinks]);

  const removeLink = useCallback(async (pbId: string) => {
    await contactsApi.unlink(pbId);
    await fetchLinks();
  }, [fetchLinks]);

  const mergeAndLink = useCallback(async (
    pbId: string,
    carddavHref: string,
    fieldSelections: MergeFieldSelections,
  ) => {
    await contactsApi.merge(pbId, carddavHref, fieldSelections);
    await fetchLinks();
  }, [fetchLinks]);

  // Helper lookups
  const getHrefForPbId = useCallback((pbId: string) => links[pbId], [links]);
  const getPbIdForHref = useCallback((href: string) => {
    for (const [pbId, h] of Object.entries(links)) {
      if (h === href) return pbId;
    }
    return undefined;
  }, [links]);

  return { links, linkToExisting, linkCreateNew, removeLink, mergeAndLink, getHrefForPbId, getPbIdForHref, refetch: fetchLinks };
}
