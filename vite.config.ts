import { defineConfig } from "vitest/config";

// Dev-server proxy so the browser app is same-origin with the broker in dev —
// no CORS needed on the broker. The broker/PBX live on the VPS; point
// BROKER_ORIGIN at it (defaults to the production box). In prod the built
// static files are served same-origin by nginx, so these proxies are dev-only.
const BROKER_ORIGIN = process.env.BROKER_ORIGIN ?? "https://pbx.wdmarais.dev";

export default defineConfig({
  server: {
    proxy: {
      // WebRTC SIP signalling: wss://{host}/ws -> ws://127.0.0.1:8088/ws (via nginx)
      "/ws": { target: BROKER_ORIGIN, changeOrigin: true, ws: true, secure: true },
      // Control plane (SSE + REST)
      "/events": { target: BROKER_ORIGIN, changeOrigin: true, secure: true },
      "/originate": { target: BROKER_ORIGIN, changeOrigin: true, secure: true },
      "/calls": { target: BROKER_ORIGIN, changeOrigin: true, secure: true },
      "/health": { target: BROKER_ORIGIN, changeOrigin: true, secure: true },
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
