import { defineConfig } from "vitest/config";

// The tests cover the DOM-free core (frame protocol, LT fountain codes), so
// they deliberately do not load vite.config.ts: no dev HTTPS cert, no PWA
// plugin, just node.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
