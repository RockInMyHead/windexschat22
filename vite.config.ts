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
      '127.0.0.1',
      'ai.windexs.ru',
      'www.ai.windexs.ru',
      'cute-elliot-distinctively.ngrok-free.dev'
    ],
    hmr: {
      overlay: false, // Disable error overlay on mobile
    },
    proxy: {
      // Only proxy in development, production uses VITE_API_BASE_URL
      ...(process.env.NODE_ENV !== 'production' ? {
        '/api': {
          target: 'http://localhost:80',
          changeOrigin: true,
        },
      } : {}),
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
