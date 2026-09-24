/**
 * Shape of the Polar product catalogue, and the pure lookups over it.
 *
 * Sandbox and production are separate Polar organisations with separate product
 * ids, so "which product is the Angel plan" is environment-dependent. Resolving
 * the catalogue reads the environment and therefore lives in
 * `src/server/polarCatalog.ts`; everything here takes an already-resolved
 * catalogue and stays pure, so it is safe to import from modules that are part
 * of the client route graph (the Polar webhook route is one).
 */

export const CATALOG_KEYS = ["angel", "syndicate", "institution", "extra_seat"] as const;
export type CatalogKey = (typeof CATALOG_KEYS)[number];

/** The purchasable plans — everything except the standalone seat add-on. */
export type PlanCatalogKey = Exclude<CatalogKey, "extra_seat">;

/** Where a resolved id came from — surfaced by the /environment diagnostics. */
export type CatalogSource = "env" | "default" | "missing";

export type PolarCatalog = {
  appEnv: "production" | "preview";
  server: "production" | "sandbox";
  products: Record<CatalogKey, string | null>;
  sources: Record<CatalogKey, CatalogSource>;
};

/** Env var holding the product id for one key in one environment. */
export function catalogEnvVar(env: PolarCatalog["appEnv"], key: CatalogKey) {
  const prefix = env === "production" ? "POLAR_PRODUCTION_PRODUCT_" : "POLAR_SANDBOX_PRODUCT_";
  return `${prefix}${key.toUpperCase()}`;
}

/**
 * Builds a catalogue from explicit ids, deriving `sources` from what is present.
 * Used by the environment-reading resolver and by tests, so both agree on shape.
 */
export function catalogOf(
  appEnv: PolarCatalog["appEnv"],
  products: Record<CatalogKey, string | null>,
): PolarCatalog {
  const sources = {} as Record<CatalogKey, CatalogSource>;
  for (const key of CATALOG_KEYS) {
    sources[key] = products[key] ? "env" : "missing";
  }
  return {
    appEnv,
    server: appEnv === "production" ? "production" : "sandbox",
    products,
    sources,
  };
}

/** Product id for a key, or null when unconfigured. */
export function productIdFor(catalog: PolarCatalog, key: CatalogKey): string | null {
  return catalog.products[key] ?? null;
}

/**
 * Polar product id -> app plan id, within this environment only. A product from
 * the other environment deliberately does not match; the webhook then falls back
 * to the plan recorded in checkout metadata.
 */
export function planIdForProduct(
  catalog: PolarCatalog,
  productId: string | null | undefined,
): PlanCatalogKey | undefined {
  if (!productId) return undefined;
  for (const key of CATALOG_KEYS) {
    if (key === "extra_seat") continue;
    if (catalog.products[key] === productId) return key;
  }
  return undefined;
}

/**
 * True when a product is the standalone extra-seat product. Those subscriptions
 * only move the seat count — they must never overwrite the account's plan.
 */
export function isExtraSeatProduct(
  catalog: PolarCatalog,
  productId: string | null | undefined,
): boolean {
  if (!productId) return false;
  return catalog.products.extra_seat === productId;
}

/**
 * Product id or a thrown error naming the exact missing variable — so a
 * misconfigured environment fails with an instruction rather than Polar's
 * opaque "product doesn't exist" 404.
 */
export function requireProductId(catalog: PolarCatalog, key: CatalogKey): string {
  const id = productIdFor(catalog, key);
  if (id) return id;
  throw new Error(
    `No Polar product configured for "${key}" in the ${catalog.server} environment. ` +
      `Set ${catalogEnvVar(catalog.appEnv, key)}.`,
  );
}
