import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  base: "/",
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
        target: 'http://localhost:80',
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
