import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/photo-carb-counter/",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
