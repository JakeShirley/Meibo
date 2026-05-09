import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  version: string;
};
const changelogUrl = new URL("./CHANGELOG.md", import.meta.url);
const changelogFallback = `# Changelog

No generated changelog is available in this build.`;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "meibo-changelog",
      resolveId(id) {
        return id === "virtual:meibo-changelog" ? "\0virtual:meibo-changelog" : undefined;
      },
      load(id) {
        if (id !== "\0virtual:meibo-changelog") return undefined;
        let changelog = changelogFallback;
        try {
          changelog = readFileSync(changelogUrl, "utf8");
        } catch {
          // CHANGELOG.md is generated during release builds and intentionally not checked in.
        }
        return `export default ${JSON.stringify(changelog)};`;
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
