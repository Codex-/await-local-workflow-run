/// <reference types="vitest" />
import { ConfigEnv, defineConfig, loadEnv } from "vite";

export default defineConfig({
  test: {
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
    },
  },
});
