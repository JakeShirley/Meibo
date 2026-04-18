interface Props {
  exportUrl: (format: "csv" | "json") => string;
}

export default function ExportButtons({ exportUrl }: Props) {
  const handleExport = (format: "csv" | "json") => {
    // Server-side export — just navigate to the download URL
    window.open(exportUrl(format), "_blank");
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => handleExport("csv")}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
      >
        Export CSV
      </button>
      <button
        onClick={() => handleExport("json")}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-hover"
      >
        Export JSON
      </button>
    </div>
  );
}
