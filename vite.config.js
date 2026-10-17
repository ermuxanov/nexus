import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import ui from "@nuxt/ui/vite";
import { uiConfig } from "./src/app/ui.js";

export default defineConfig({
  plugins: [vue(), ui({ colorMode: false, autoImport: false, components: false, dts: false, ui: uiConfig })],
});
