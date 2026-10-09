// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const BACKEND_URL = (
  process.env.BACKEND_URL ?? "https://tgo-workforce-backend-production.up.railway.app"
).replace(/\/+$/, "");

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Build a plain Node.js server instead of the default Cloudflare Workers target.
  // Nitro's node-server preset bundles the server AND correctly serves the built
  // client assets (JS/CSS/images) itself — no manual static-file wiring needed.
  // Output lands at .output/server/index.mjs (see the "start" script in package.json).
  nitro: {
    preset: "node-server",
    // Same-origin API: the browser calls /backend/... on THIS site (e.g.
    // workforce.tgocorp.com) and this server forwards it to the FastAPI backend,
    // cookies included. That is what lets the TGO Gateway's login cookie
    // (scoped to .tgocorp.com) reach the backend even though the backend itself
    // stays on its railway.app address. It also makes the API same-site, so no
    // CORS or third-party-cookie issues. Used when VITE_API_URL is "/backend";
    // leave VITE_API_URL as the backend's full URL to call it directly instead.
    // BACKEND_URL is read at build time; the default is the public backend.
    routeRules: {
      "/backend/**": { proxy: `${BACKEND_URL}/**` },
    },
  },
});
