import { defineConfig } from "vitest/config";

const port = Number(process.env.PORT ?? 5173);
const proxy = { "/api": { target: process.env.API_URL ?? "http://127.0.0.1:8787", changeOrigin: true } };
const server = { port, strictPort: true, host: true, allowedHosts: [".ts.net"], proxy };

export default defineConfig({
  server,
  preview: server,
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
