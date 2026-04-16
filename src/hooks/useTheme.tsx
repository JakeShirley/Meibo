import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";

export type ThemeName = "default" | "dracula" | "sakura";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeName>(() => {
    return (localStorage.getItem("theme") as ThemeName) || "default";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
