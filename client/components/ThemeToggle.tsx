import { useTheme } from "../hooks/useTheme.tsx";
import type { ThemeName } from "../hooks/useTheme.tsx";

const THEMES: { key: ThemeName; label: string }[] = [
  { key: "default", label: "Light" },
  { key: "dracula", label: "Dracula" },
  { key: "sakura", label: "Cherry Blossom" },
];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <select
      value={theme}
      onChange={(e) => setTheme(e.target.value as ThemeName)}
      className="rounded-md border border-input-border bg-surface-alt px-2 py-1 text-xs text-text-secondary focus:border-input-focus focus:outline-none"
    >
      {THEMES.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}
