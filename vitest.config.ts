import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["app/**/*.test.ts", "app/**/*.test.tsx", "server/**/*.test.ts", "lib/**/*.test.ts"]
  }
});
