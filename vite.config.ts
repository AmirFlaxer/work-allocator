import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("html-to-image")) return "vendor-image";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("react-dom") || id.includes("react-router") || id.includes("react/")) return "vendor-react";
        },
      },
    },
  },
}));
