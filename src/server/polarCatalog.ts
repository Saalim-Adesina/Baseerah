/**
 * Resolves the Polar product catalogue for the active environment.
 *
 * This is the only place that turns environment variables into product ids.
 * Before it existed the answer was spread across three functions that
 * disagreed: checkout consulted env overrides only in sandbox, while the
 * webhook's product-to-plan mapping checked live ids and sandbox ids
 * unconditionally. That mismatch is what let a sandbox deploy send live product
 * ids to the sandbox API and 404.
 *
 * Server-only. The pure lookups over a resolved catalogue live in
 * `src/lib/polar-catalog.ts` so client-graph modules can use them.
 */
// Relative with explicit extensions: scripts/ load this through node
// --experimental-strip-types, which does not resolve tsconfig path aliases.
import { appEnv, type AppEnv } from "./appEnv.ts";
import {
  CATALOG_KEYS,
  catalogEnvVar,
  type CatalogKey,
  type CatalogSource,
  type PolarCatalog,
} from "../lib/polar-catalog.ts";

/**
 * Live product ids. Defaults for production only — never a sandbox fallback,
 * because sending a live id to the sandbox API is exactly the failure this
 * module exists to prevent.
 */
const PRODUCTION_DEFAULTS: Record<CatalogKey, string> = {
  angel: "c59a5ea7-e21e-4894-98a3-3ac1c1fa433e",
  syndicate: "964f4eb8-91b2-4289-ab4a-35d8c26d9420",
  institution: "a6970a25-435f-4278-9657-bc89fd7a5598",
  extra_seat: "7afd79f7-1f49-47bb-8812-b985800c0354",
};

/** Builds a catalogue for an explicit environment. */
export function buildCatalog(env: AppEnv): PolarCatalog {
  const products = {} as Record<CatalogKey, string | null>;
  const sources = {} as Record<CatalogKey, CatalogSource>;

  for (const key of CATALOG_KEYS) {
    const fromEnv = process.env[catalogEnvVar(env, key)]?.trim();
    if (fromEnv) {
      products[key] = fromEnv;
      sources[key] = "env";
      continue;
    }
    // Production falls back to the id shipped here so a production deploy keeps
    // working with no extra configuration. Sandbox has no sensible default —
    // "unconfigured" is the honest answer.
    if (env === "production") {
      products[key] = PRODUCTION_DEFAULTS[key];
      sources[key] = "default";
    } else {
      products[key] = null;
      sources[key] = "missing";
    }
  }

  return {
    appEnv: env,
    server: env === "production" ? "production" : "sandbox",
    products,
    sources,
  };
}

const warned = new Set<string>();

/** The catalogue for the currently configured environment. */
export function polarCatalog(): PolarCatalog {
  const catalog = buildCatalog(appEnv());

  // One warning per environment per process. Never fatal: an unconfigured
  // product must not take down routes that have nothing to do with billing.
  const missing = CATALOG_KEYS.filter((key) => catalog.sources[key] === "missing");
  if (missing.length > 0 && !warned.has(catalog.appEnv)) {
    warned.add(catalog.appEnv);
    console.warn(
      `[polar] APP_ENV=${catalog.appEnv} has no product id for: ${missing.join(", ")}. ` +
        `Set ${missing.map((key) => catalogEnvVar(catalog.appEnv, key)).join(", ")}.`,
    );
  }

  return catalog;
}
