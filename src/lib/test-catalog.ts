/**
 * Fixed Polar catalogues for tests.
 *
 * Product ids are environment-specific, so tests that used to depend on
 * `process.env` (or on ids hardcoded in `plans.ts`) now pass one of these
 * explicitly. That keeps every billing test deterministic and independent of
 * whichever environment the test runner happens to be configured for.
 */
import { catalogOf, type PolarCatalog } from "@/lib/polar-catalog";

export const SANDBOX_CATALOG: PolarCatalog = catalogOf("preview", {
  angel: "sandbox-angel",
  syndicate: "sandbox-syndicate",
  institution: "sandbox-institution",
  extra_seat: "sandbox-extra-seat",
});

export const PRODUCTION_CATALOG: PolarCatalog = catalogOf("production", {
  angel: "live-angel",
  syndicate: "live-syndicate",
  institution: "live-institution",
  extra_seat: "live-extra-seat",
});
