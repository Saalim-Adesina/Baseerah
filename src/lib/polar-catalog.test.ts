import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  catalogEnvVar,
  isExtraSeatProduct,
  planIdForProduct,
  requireProductId,
} from "@/lib/polar-catalog";
import { PRODUCTION_CATALOG, SANDBOX_CATALOG } from "@/lib/test-catalog";
import { appEnv } from "@/server/appEnv";
import { buildCatalog } from "@/server/polarCatalog";

/** The live ids that ship as production defaults. */
const LIVE_ANGEL = "c59a5ea7-e21e-4894-98a3-3ac1c1fa433e";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APP_ENV", () => {
  it("defaults to preview so an unset variable never bills a real card", () => {
    vi.stubEnv("APP_ENV", undefined as unknown as string);
    expect(appEnv()).toBe("preview");
  });

  it("treats an unrecognised value as preview, not production", () => {
    vi.stubEnv("APP_ENV", "staging");
    expect(appEnv()).toBe("preview");
  });

  it("selects production only on an exact match", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(appEnv()).toBe("production");
  });
});

describe("catalogue resolution", () => {
  it("names the right variable per environment", () => {
    expect(catalogEnvVar("production", "angel")).toBe("POLAR_PRODUCTION_PRODUCT_ANGEL");
    expect(catalogEnvVar("preview", "extra_seat")).toBe("POLAR_SANDBOX_PRODUCT_EXTRA_SEAT");
  });

  it("falls back to the shipped live ids in production", () => {
    vi.stubEnv("POLAR_PRODUCTION_PRODUCT_ANGEL", undefined as unknown as string);
    const catalog = buildCatalog("production");
    expect(catalog.products.angel).toBe(LIVE_ANGEL);
    expect(catalog.sources.angel).toBe("default");
  });

  it("prefers the production env override over the shipped default", () => {
    vi.stubEnv("POLAR_PRODUCTION_PRODUCT_ANGEL", "repriced-angel");
    const catalog = buildCatalog("production");
    expect(catalog.products.angel).toBe("repriced-angel");
    expect(catalog.sources.angel).toBe("env");
  });

  it("reads sandbox ids from the sandbox variables", () => {
    vi.stubEnv("POLAR_SANDBOX_PRODUCT_SYNDICATE", "sbx-syndicate");
    const catalog = buildCatalog("preview");
    expect(catalog.products.syndicate).toBe("sbx-syndicate");
    expect(catalog.sources.syndicate).toBe("env");
  });

  // The regression this module exists to prevent: an unset sandbox variable used
  // to leave the live id in place, which the sandbox API rejects as
  // "product doesn't exist" only once a user reaches checkout.
  it("leaves an unconfigured sandbox product null rather than using the live id", () => {
    vi.stubEnv("POLAR_SANDBOX_PRODUCT_ANGEL", undefined as unknown as string);
    const catalog = buildCatalog("preview");
    expect(catalog.products.angel).toBeNull();
    expect(catalog.sources.angel).toBe("missing");
    expect(catalog.products.angel).not.toBe(LIVE_ANGEL);
  });

  it("derives the API environment from the app environment", () => {
    expect(buildCatalog("production").server).toBe("production");
    expect(buildCatalog("preview").server).toBe("sandbox");
  });
});

describe("catalogue lookups", () => {
  it("does not map a product id across environments", () => {
    const liveSyndicate = PRODUCTION_CATALOG.products.syndicate;
    expect(planIdForProduct(PRODUCTION_CATALOG, liveSyndicate)).toBe("syndicate");
    expect(planIdForProduct(SANDBOX_CATALOG, liveSyndicate)).toBeUndefined();
  });

  it("never maps the extra-seat product to a plan", () => {
    expect(planIdForProduct(SANDBOX_CATALOG, SANDBOX_CATALOG.products.extra_seat)).toBeUndefined();
    expect(isExtraSeatProduct(SANDBOX_CATALOG, SANDBOX_CATALOG.products.extra_seat)).toBe(true);
  });

  it("does not treat the other environment's seat product as an extra seat", () => {
    expect(isExtraSeatProduct(SANDBOX_CATALOG, PRODUCTION_CATALOG.products.extra_seat)).toBe(false);
    expect(isExtraSeatProduct(SANDBOX_CATALOG, null)).toBe(false);
  });

  it("throws naming the exact missing variable instead of letting Polar 404", () => {
    const catalog = buildCatalog("preview");
    catalog.products.angel = null;
    expect(() => requireProductId(catalog, "angel")).toThrowError(/POLAR_SANDBOX_PRODUCT_ANGEL/);
  });
});

// plans.ts and billing-rules.ts are imported by browser code. Environment
// reads belong on the server, and this is the cheap guard that stops them
// creeping back in.
describe("client-safe modules", () => {
  it.each(["src/lib/plans.ts", "src/lib/billing-rules.ts", "src/lib/polar-catalog.ts"])(
    "%s reads no environment variables",
    (file) => {
      expect(readFileSync(file, "utf8")).not.toContain("process.env");
    },
  );
});
