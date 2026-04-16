import { useState } from "react";
import type { Contact } from "../types/contact.ts";
import { exportToCSV, exportToJSON } from "../lib/export.ts";

interface Props {
  fetchAll: () => Promise<Contact[]>;
}

export default function ExportButtons({ fetchAll }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async (format: "csv" | "json") => {
    setLoading(true);
    try {
      const all = await fetchAll();
      if (format === "csv") {
        exportToCSV(all);
      } else {
        exportToJSON(all);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("csv")}
        disabled={loading}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Exporting…" : "Export CSV"}
      </button>
      <button
        onClick={() => handleExport("json")}
        disabled={loading}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {loading ? "Exporting…" : "Export JSON"}
      </button>
    </div>
  );
}
