import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  site: process.env.SITE_URL ?? "https://occlus.lat",
  output: "server",
  adapter: node({ mode: "standalone", bodySizeLimit: 16 * 1024 }),
  vite: { plugins: [tailwindcss()] },
});
