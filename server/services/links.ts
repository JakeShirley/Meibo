import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LINKS_FILE = path.resolve(process.env.CARDDAV_LINKS_FILE || path.join(__dirname, "..", "..", "data", "carddav-links.json"));

/** pbId → carddav href */
export type LinkMap = Record<string, string>;

function ensureDir() {
  const dir = path.dirname(LINKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadLinks(): LinkMap {
  try {
    if (!fs.existsSync(LINKS_FILE)) return {};
    return JSON.parse(fs.readFileSync(LINKS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveLinks(links: LinkMap) {
  ensureDir();
  fs.writeFileSync(LINKS_FILE, JSON.stringify(links, null, 2));
}

export function setLink(pbId: string, carddavHref: string) {
  const links = loadLinks();
  links[pbId] = carddavHref;
  saveLinks(links);
}

export function removeLink(pbId: string) {
  const links = loadLinks();
  delete links[pbId];
  saveLinks(links);
}

export function getHrefForPbId(pbId: string): string | undefined {
  return loadLinks()[pbId];
}

export function getPbIdForHref(href: string): string | undefined {
  const links = loadLinks();
  for (const [pbId, h] of Object.entries(links)) {
    if (h === href) return pbId;
  }
  return undefined;
}
