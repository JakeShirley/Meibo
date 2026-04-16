interface Props {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-sm text-text-secondary">
      <span>{totalItems} contact{totalItems !== 1 ? "s" : ""} total</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-border px-3 py-1 text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded-md border border-border px-3 py-1 text-text hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
