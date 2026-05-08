import { useState } from "react";
import { downloadApiFile } from "../lib/api.ts";

interface Props {
  exportUrl: (format: "csv" | "json") => string;
}

export default function ExportButtons({ exportUrl }: Props) {
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (format: "csv" | "json") => {
    setError(null);
    setExporting(format);
    try {
      await downloadApiFile(exportUrl(format));
    } catch (err) {
      console.error("[Export] Download failed:", err);
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <button
          onClick={() => handleExport("csv")}
          disabled={exporting !== null}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting === "csv" ? "Exporting..." : "Export CSV"}
        </button>
        <button
          onClick={() => handleExport("json")}
          disabled={exporting !== null}
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {exporting === "json" ? "Exporting..." : "Export JSON"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
