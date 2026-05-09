import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChangelogModalProps {
  markdown: string;
  version: string;
  onClose: () => void;
}

const markdownComponents = {
  h1({ children }) {
    return <h1 className="border-b border-border pb-3 text-2xl font-semibold text-text">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mt-7 border-b border-border-light pb-2 text-xl font-semibold text-text">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mt-5 text-base font-semibold text-text">{children}</h3>;
  },
  p({ children }) {
    return <p className="mt-3 text-sm leading-6 text-text-secondary">{children}</p>;
  },
  a({ children, ...props }) {
    const external = props.href?.startsWith("http");
    return (
      <a
        {...props}
        className="font-medium text-primary-text underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-text-secondary">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-text-secondary">{children}</ol>;
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>;
  },
  blockquote({ children }) {
    return <blockquote className="mt-4 border-l-4 border-primary-light pl-4 text-sm text-text-secondary">{children}</blockquote>;
  },
  code({ children, className }) {
    return <code className={`${className ?? ""} rounded bg-surface px-1.5 py-0.5 text-[0.85em] text-text`}>{children}</code>;
  },
  pre({ children }) {
    return <pre className="mt-4 overflow-x-auto rounded-md border border-border bg-surface p-4 text-sm text-text">{children}</pre>;
  },
  table({ children }) {
    return (
      <div className="mt-4 overflow-x-auto rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm text-text-secondary">{children}</table>
      </div>
    );
  },
  th({ children }) {
    return <th className="bg-thead px-3 py-2 text-left text-xs font-semibold uppercase text-text">{children}</th>;
  },
  td({ children }) {
    return <td className="border-t border-border-light px-3 py-2 align-top">{children}</td>;
  },
  hr() {
    return <hr className="my-6 border-border" />;
  },
} satisfies Components;

export default function ChangelogModal({ markdown, version, onClose }: ChangelogModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="changelog-title">
      <div className="flex max-h-full w-full max-w-4xl flex-col rounded-lg border border-border bg-surface-alt shadow-xl">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 id="changelog-title" className="text-lg font-semibold text-text">Changelog</h2>
            <p className="mt-0.5 text-sm text-text-secondary">Version {version}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text"
            aria-label="Close changelog"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">
          <article className="max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}