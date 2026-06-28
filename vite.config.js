import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
// Dev-server proxy so the browser app is same-origin with the broker in dev —
// no CORS needed on the broker. The broker/PBX live at VITE_PBX_DOMAIN (set in a
// gitignored .env; no default — the deployment domain must never live in source).
// In prod the built static files are served same-origin by nginx, so these
// proxies are dev-only.
export default defineConfig(({ command, mode }) => {
    const env = loadEnv(mode, process.cwd(), "");
    const domain = env.VITE_PBX_DOMAIN;
    const test = {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
    };
    // Only the dev server needs the proxy; unit tests (`vitest`) must not require
    // deployment config, so fail loud only when actually serving.
    if (!domain) {
        if (command === "serve") {
            throw new Error("VITE_PBX_DOMAIN is not set — copy .env.example to .env and set it.");
        }
        return { test };
    }
    const origin = `https://${domain}`;
    const p = (extra = {}) => ({
        target: origin,
        changeOrigin: true,
        secure: true,
        ...extra,
    });
    return {
        server: {
            proxy: {
                // WebRTC SIP signalling: wss://{host}/ws -> ws://127.0.0.1:8088/ws (via nginx)
                "/ws": p({ ws: true }),
                // Control plane (SSE + REST)
                "/events": p(),
                "/originate": p(),
                "/calls": p(),
                "/health": p(),
            },
        },
        test,
    };
});
