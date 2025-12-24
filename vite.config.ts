import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? "/" : "/",
  server: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: false,
    allowedHosts: [
      'localhost',
      '127.0.0.1'
    ],
    hmr: {
      overlay: false, // Disable error overlay on mobile
    },
    proxy: {
      '/api': {
        target: 'http://localhost:1062',
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
