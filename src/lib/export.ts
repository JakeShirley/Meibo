import type { Contact } from "../types/contact.ts";

const SKIP_FIELDS = new Set(["id", "collectionId", "collectionName", "created", "updated"]);

function getExportFields(contacts: Contact[]): string[] {
  if (contacts.length === 0) return [];
  return Object.keys(contacts[0]).filter((k) => !SKIP_FIELDS.has(k));
}

export function exportToCSV(contacts: Contact[], filename = "contacts.csv") {
  const fields = getExportFields(contacts);
  const header = fields.join(",");
  const rows = contacts.map((c) =>
    fields.map((f) => {
      const val = String(c[f] ?? "");
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(","),
  );
  const csv = [header, ...rows].join("\n");
  download(csv, filename, "text/csv");
}

export function exportToJSON(contacts: Contact[], filename = "contacts.json") {
  const fields = getExportFields(contacts);
  const clean = contacts.map((c) => {
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      out[f] = c[f] ?? "";
    }
    return out;
  });
  const json = JSON.stringify(clean, null, 2);
  download(json, filename, "application/json");
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
