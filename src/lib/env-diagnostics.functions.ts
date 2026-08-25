/**
 * Developer-only view of how this deployment is actually configured.
 *
 * The bug this exists for: a preview deploy silently using live product ids.
 * Nothing surfaced that until a user reached checkout and Polar answered
 * "product doesn't exist". Here every product id is resolved and then fetched
 * from the Polar organisation this deployment is really pointed at, so a
 * mismatch is visible before anyone tries to pay.
 *
 * Never returns a secret value — only whether one is present, plus a short
 * fingerprint so two different tokens can be told apart.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CATALOG_KEYS, catalogEnvVar, type CatalogSource } from "@/lib/polar-catalog";

export type ProductDiagnostic = {
  key: string;
  envVar: string;
  source: CatalogSource;
  productId: string | null;
  resolves: boolean;
  productName: string | null;
  error: string | null;
};

export type WebhookDiagnostic = {
  id: string;
  url: string;
  events: number;
  secretMatches: boolean;
};

export type EnvDiagnostics = {
  appEnv: string;
  polarServer: string;
  polarApiBase: string;
  accessToken: { present: boolean; fingerprint: string | null; envVar: string };
  webhookSecret: { present: boolean; fingerprint: string | null; envVar: string };
  supabaseUrl: string | null;
  appOrigins: string[];
  products: ProductDiagnostic[];
  webhooks: WebhookDiagnostic[];
  webhookError: string | null;
};

/** Enough of a secret to compare two, not enough to use one. */
function fingerprint(value: string | undefined) {
  if (!value) return null;
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export const getEnvDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnvDiagnostics> => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "developer",
    });
    if (error || !data) throw new Error("Forbidden — developer access required.");

    const { appEnv } = await import("@/server/appEnv");
    const { polarCatalog } = await import("@/server/polarCatalog");
    const { polarServer, polarApiBase, getProduct, listWebhookEndpoints, polarWebhookSecret } =
      await import("@/lib/polar.server");
    const { allowedOrigins } = await import("@/server/appOrigin");

    const catalog = polarCatalog();
    const server = polarServer();
    const tokenVar =
      server === "production" ? "POLAR_PRODUCTION_ACCESS_TOKEN" : "POLAR_SANDBOX_ACCESS_TOKEN";
    const secretVar =
      server === "production" ? "POLAR_PRODUCTION_WEBHOOK_SECRET" : "POLAR_SANDBOX_WEBHOOK_SECRET";
    const secret = polarWebhookSecret();

    // Each id is fetched from the live organisation: a configured-but-wrong id
    // is the failure mode, and only a round trip proves it.
    const products: ProductDiagnostic[] = [];
    for (const key of CATALOG_KEYS) {
      const productId = catalog.products[key];
      const base: ProductDiagnostic = {
        key,
        envVar: catalogEnvVar(catalog.appEnv, key),
        source: catalog.sources[key],
        productId,
        resolves: false,
        productName: null,
        error: null,
      };
      if (!productId) {
        products.push({ ...base, error: "No product id configured." });
        continue;
      }
      try {
        const product = await getProduct(productId);
        products.push({ ...base, resolves: true, productName: product.name });
      } catch (cause) {
        products.push({
          ...base,
          error: cause instanceof Error ? cause.message.slice(0, 200) : "Lookup failed.",
        });
      }
    }

    // Polar regenerates an endpoint's signing secret on sync and ignores the one
    // we send, so a mismatch here is the usual cause of silently rejected
    // deliveries.
    let webhooks: WebhookDiagnostic[] = [];
    let webhookError: string | null = null;
    try {
      webhooks = (await listWebhookEndpoints()).map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events.length,
        secretMatches: Boolean(secret) && endpoint.secret === secret,
      }));
    } catch (cause) {
      webhookError = cause instanceof Error ? cause.message.slice(0, 200) : "Lookup failed.";
    }

    return {
      appEnv: catalog.appEnv,
      polarServer: server,
      polarApiBase: polarApiBase(),
      accessToken: {
        present: Boolean(process.env[tokenVar]),
        fingerprint: fingerprint(process.env[tokenVar]),
        envVar: tokenVar,
      },
      webhookSecret: {
        present: Boolean(secret),
        fingerprint: fingerprint(secret),
        envVar: secretVar,
      },
      supabaseUrl: process.env["SUPABASE_URL"] ?? null,
      appOrigins: allowedOrigins(),
      products,
      webhooks,
      webhookError,
    };
  });
