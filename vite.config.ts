import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/_app/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icons/icon-192.svg", "icons/icon-512.svg"],
      manifest: {
        name: "Iara",
        short_name: "Iara",
        description:
          "Chat PWA local-first para falar com o seu assistente de IA (ZeroClaw e gateways compatíveis). Configure URL e key e converse.",
        theme_color: "#0f766e",
        background_color: "#0b1220",
        display: "standalone",
        start_url: "/",
        lang: "pt-BR",
        icons: [
          { src: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/_app/",
        runtimeCaching: [
          {
            urlPattern: /\/ws\/chat/,
            handler: "NetworkOnly",
            options: { backgroundSync: { name: "iara-ws" } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
