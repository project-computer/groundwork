import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { lingui } from "@lingui/vite-plugin";
import path from "node:path";

const alias = [
  {
    find: "@",
    replacement: path.resolve(import.meta.dirname, "./src"),
  },
];

export default defineConfig({
  plugins: [react(), lingui({ macroTransform: true }), tailwindcss()],
  resolve: { alias, dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "cn",
      "class-variance-authority",
      "lucide-react",
      "vitest-browser-react",
    ],
  },
  test: {
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: ["src/**/*.{component,screenshot}.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          alias,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          include: ["src/**/*.{component,screenshot}.test.{ts,tsx}"],
        },
      },
    ],
  },
});
