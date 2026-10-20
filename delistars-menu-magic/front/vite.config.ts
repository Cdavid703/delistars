import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Id de este build: va dentro del código y en version.json. Si el menú abierto
// tiene otro id que el publicado, AvisoVersion ofrece recargar.
const BUILD_ID = process.env.BUILD_ID || new Date().toISOString();
const versionJson = {
  name: "version-json",
  generateBundle(this: { emitFile: (f: { type: "asset"; fileName: string; source: string }) => void }) {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) });
  },
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8081,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), versionJson, mode === "development" && componentTagger()].filter(Boolean),
  define: { "import.meta.env.VITE_BUILD_ID": JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
