/**
 * Validates the environment variables this app needs, for one environment.
 *
 *   npm run env:check                 # checks whatever APP_ENV resolves to
 *   npm run env:check -- --env=production
 *
 * Deliberately not wired into `npm run build`: on Vercel a missing variable
 * would block the deploy entirely, which is worse than shipping and showing the
 * gap on the /environment diagnostics page.
 */
import { appEnv, APP_ENVS, type AppEnv } from "../src/server/appEnv.ts";
import { buildCatalog } from "../src/server/polarCatalog.ts";
import { CATALOG_KEYS, catalogEnvVar } from "../src/lib/polar-catalog.ts";

const flag = process.argv.slice(2).find((a) => a.startsWith("--env="));
const requested = flag?.slice("--env=".length);
if (requested && !APP_ENVS.includes(requested as AppEnv)) {
  console.error(`Unknown --env=${requested}. Expected one of: ${APP_ENVS.join(", ")}`);
  process.exit(2);
}
const env: AppEnv = (requested as AppEnv) ?? appEnv();

/** Needed in every environment. */
const ALWAYS = [
  "PUBLIC_APP_URL",
  "APP_USER_CONNECTION_KEY_SECRET",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "AZURE_FOUNDRY_ENDPOINT",
  "AZURE_FOUNDRY_API_KEY",
  "AZURE_FOUNDRY_DEPLOYMENT",
  "AZURE_DOC_INTELLIGENCE_ENDPOINT",
  "AZURE_DOC_INTELLIGENCE_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
];

/** Names that were replaced — set but unread means a half-done migration. */
const RETIRED = ["POLAR_SERVER", "POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET"];

const polarPrefix = env === "production" ? "POLAR_PRODUCTION" : "POLAR_SANDBOX";
const credentials = [`${polarPrefix}_ACCESS_TOKEN`, `${polarPrefix}_WEBHOOK_SECRET`];

const rows: { name: string; status: string; note: string }[] = [];
let missing = 0;

for (const name of [...ALWAYS, ...credentials]) {
  const present = Boolean(process.env[name]?.trim());
  if (!present) missing++;
  rows.push({ name, status: present ? "set" : "MISSING", note: "" });
}

// Product ids: required in sandbox (no sensible default), optional in
// production (the live ids ship in src/server/polarCatalog.ts).
const catalog = buildCatalog(env);
for (const key of CATALOG_KEYS) {
  const name = catalogEnvVar(env, key);
  const source = catalog.sources[key];
  if (source === "missing") missing++;
  rows.push({
    name,
    status: source === "missing" ? "MISSING" : "set",
    note: source === "default" ? "using shipped live id" : "",
  });
}

for (const name of RETIRED) {
  if (process.env[name] !== undefined) {
    rows.push({ name, status: "retired", note: "set but no longer read — remove it" });
  }
}

console.log(`\nEnvironment: APP_ENV=${env}  ->  Polar ${catalog.server}\n`);
console.table(rows.map((r) => ({ variable: r.name, status: r.status, note: r.note })));

if (missing > 0) {
  console.error(`\n${missing} required variable(s) missing for APP_ENV=${env}.\n`);
  process.exit(1);
}
console.log(`\nAll required variables are set for APP_ENV=${env}.\n`);
