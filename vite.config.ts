import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv, type PluginOption } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Server-side variables (SUPABASE_*, Azure keys, Google OAuth, Polar, …) come
// from the hosting provider's environment in production. Locally there is no
// injector, so server functions would see `process.env.SUPABASE_URL ===
// undefined` and every authenticated call would fail with "Missing Supabase
// environment variable(s)". Load the non-VITE_ values from .env / .env.local
// here so `vite dev` behaves like the deployed runtime. Existing process env
// always wins.
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
    // Blank placeholders are ignored: an empty `FOO=""` in .env.local must not
    // shadow a real value further down the file or in .env.
    if (!key || value === "" || process.env[key] !== undefined) continue;
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

export default defineConfig(async ({ command, mode }) => {
  const plugins: PluginOption[] = [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our
      // SSR error wrapper). nitro builds from this.
      server: { entry: "server" },
      // Fail the build if browser code reaches into server-only modules.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
  ];

  // Nitro turns the Start output into a deployable bundle. Build-time only —
  // adding it to the dev server breaks HMR. NITRO_PRESET overrides the target
  // (e.g. `node-server` for a plain VPS, `cloudflare-module` for Workers).
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    plugins.push(
      nitro({
        preset: process.env["NITRO_PRESET"] ?? "vercel",
        // Deck extraction polls Azure Document Intelligence for up to 4 minutes
        // and a Gmail scan runs several of those back to back. Vercel's default
        // function timeout kills both, so raise it. The ceiling depends on the
        // plan — 300s is safe on Pro, Hobby caps lower.
        vercel: { functions: { maxDuration: 300 } },
      }),
    );
  }

  plugins.push(viteReact());

  // Inline VITE_* values so the client bundle sees them via import.meta.env.
  const clientEnv = loadEnv(mode, process.cwd(), "VITE_");
  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(clientEnv)) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  return {
    define,
    plugins,
    resolve: {
      alias: { "@": resolve(process.cwd(), "src") },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
  };
});
