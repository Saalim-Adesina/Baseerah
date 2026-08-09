// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// On Lovable, server-side variables (SUPABASE_URL, Azure keys, Polar, …) are injected
// into the process environment. Running locally there is no injector, so server
// functions would see `process.env.SUPABASE_URL === undefined` and every
// authenticated call would fail with "Missing Supabase environment variable(s)".
// Load the non-VITE_ values from .env / .env.local here so local `vite dev`
// behaves like the hosted runtime. Existing process env always wins.
function loadServerEnvFile(file: string) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = value;
  }
}

// .env.local first: it is git-ignored and should override the committed defaults.
loadServerEnvFile(".env.local");
loadServerEnvFile(".env");

// Mirror the publishable client config so a local .env that only defines the
// VITE_ names (or only the server names) still satisfies both sides.
const mirrors: [string, string][] = [
  ["VITE_SUPABASE_URL", "SUPABASE_URL"],
  ["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY"],
  ["VITE_SUPABASE_PROJECT_ID", "SUPABASE_PROJECT_ID"],
];
for (const [a, b] of mirrors) {
  if (!process.env[b] && process.env[a]) process.env[b] = process.env[a];
  if (!process.env[a] && process.env[b]) process.env[a] = process.env[b];
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
