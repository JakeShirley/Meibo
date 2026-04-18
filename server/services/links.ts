import { pbGetOne, pbUpdate, pbList, pbGetFullList } from "./pb.js";

const COLLECTION = process.env.VITE_PB_COLLECTION || "contacts";

/** pbId → carddav href */
export type LinkMap = Record<string, string>;

function esc(val: string): string {
  return val.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function loadLinks(): Promise<LinkMap> {
  const items = await pbGetFullList(COLLECTION, {
    filter: 'carddav_href != ""',
  });
  const map: LinkMap = {};
  for (const item of items) {
    map[String(item.id)] = String(item.carddav_href);
  }
  return map;
}

export async function setLink(pbId: string, carddavHref: string): Promise<void> {
  await pbUpdate(COLLECTION, pbId, { carddav_href: carddavHref });
}

export async function removeLink(pbId: string): Promise<void> {
  await pbUpdate(COLLECTION, pbId, { carddav_href: "" });
}

export async function getHrefForPbId(pbId: string): Promise<string | undefined> {
  const record = await pbGetOne(COLLECTION, pbId);
  const href = record.carddav_href as string | undefined;
  return href || undefined;
}

export async function getPbIdForHref(href: string): Promise<string | undefined> {
  const result = await pbList(COLLECTION, {
    filter: `carddav_href = "${esc(href)}"`,
    perPage: 1,
  });
  return result.items.length > 0 ? String(result.items[0].id) : undefined;
}
