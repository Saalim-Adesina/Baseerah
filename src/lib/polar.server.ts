/**
 * Polar API client. The organisation is derived from `APP_ENV` — production
 * talks to the live org, every other environment talks to the sandbox.
 *
 * There is deliberately no override and no cross-environment fallback. Host and
 * credential used to be chosen by separate rules (`POLAR_SERVER` for the host,
 * a `??` chain for the token), so they could disagree silently. Deriving both
 * from one variable is what makes it impossible for a preview deploy to reach
 * the live organisation.
 */
// Relative, not the "@/" alias: scripts/polar-webhooks.ts loads this module
// directly through node --experimental-strip-types, which does not resolve
// tsconfig path aliases.
import { appEnv } from "../server/appEnv.ts";

const HOSTS = {
  production: "https://api.polar.sh/v1",
  sandbox: "https://sandbox-api.polar.sh/v1",
} as const;

export type PolarServer = keyof typeof HOSTS;

export function polarServer(): PolarServer {
  return appEnv() === "production" ? "production" : "sandbox";
}

function apiBase() {
  return HOSTS[polarServer()];
}

/** The API host in use, so CLI output can show what it is pointed at. */
export function polarApiBase() {
  return apiBase();
}

/** Env var names per environment, so errors can name the exact missing one. */
function credentialNames() {
  return polarServer() === "production"
    ? {
        token: "POLAR_PRODUCTION_ACCESS_TOKEN",
        secret: "POLAR_PRODUCTION_WEBHOOK_SECRET",
        legacyToken: "POLAR_ACCESS_TOKEN",
        legacySecret: "POLAR_WEBHOOK_SECRET",
      }
    : {
        token: "POLAR_SANDBOX_ACCESS_TOKEN",
        secret: "POLAR_SANDBOX_WEBHOOK_SECRET",
        legacyToken: "POLAR_ACCESS_TOKEN",
        legacySecret: "POLAR_WEBHOOK_SECRET",
      };
}

/**
 * A renamed variable is a hard failure with a pointed message rather than a
 * silent fallback — falling back to the old name is how a deploy ends up using
 * one environment's credential against the other's host.
 */
function missingCredential(name: string, legacy: string): string {
  const renamed =
    process.env[legacy] !== undefined
      ? ` ${legacy} is set but no longer read — it was replaced by ${name}.`
      : "";
  return (
    `APP_ENV=${appEnv()} selects the Polar ${polarServer()} organisation, ` +
    `but ${name} is not set.${renamed} ` +
    `Set it in Vercel → Settings → Environment Variables for this environment, or in .env.local.`
  );
}

function token() {
  const names = credentialNames();
  const value = process.env[names.token];
  if (!value) throw new Error(missingCredential(names.token, names.legacyToken));
  return value;
}

/** Webhook signing secret for the active environment. */
export function polarWebhookSecret() {
  return process.env[credentialNames().secret];
}

/** Why the webhook secret is unusable, for server-side logging. */
export function polarWebhookSecretError() {
  const names = credentialNames();
  return missingCredential(names.secret, names.legacySecret);
}

async function polarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Polar request failed [${res.status}] ${path}: ${body}`);
    throw new Error(`Polar request failed [${res.status}]: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export type PolarCheckout = {
  id: string;
  url: string;
  status: string;
  product_id?: string;
  customer_email?: string | null;
};

export function createCheckoutSession(input: {
  productId: string;
  externalCustomerId: string;
  customerEmail?: string | null;
  successUrl: string;
  metadata?: Record<string, string>;
  /**
   * Seat count, for products priced with `amount_type: "seat_based"`. Polar
   * ignores it on fixed-price products, and a fixed-price product cannot be
   * bought in quantity at all — the same id may not be repeated in `products`.
   * So the extra-seat product must stay seat-based for multi-seat purchases to
   * bill correctly.
   */
  seats?: number;
}) {
  return polarFetch<PolarCheckout>("/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [input.productId],
      external_customer_id: input.externalCustomerId,
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      metadata: input.metadata,
      seats: input.seats,
    }),
  });
}

export function getCheckoutSession(id: string) {
  return polarFetch<PolarCheckout>(`/checkouts/${id}`);
}

/**
 * Opens the customer portal. Polar rejects `external_customer_id` for team
 * customers ("member_id is required"), so prefer the Polar customer id and
 * resolve it by email when the app row has not stored it yet.
 */
export async function createPortalSession(
  externalCustomerId: string,
  customerId?: string | null,
  email?: string | null,
) {
  const session = (body: Record<string, string>) =>
    polarFetch<{ customer_portal_url: string }>("/customer-sessions/", {
      method: "POST",
      body: JSON.stringify(body),
    });

  let resolvedId = customerId ?? null;
  if (!resolvedId && email) {
    resolvedId = (await findCustomerByEmail(email).catch(() => null))?.id ?? null;
  }
  if (resolvedId) return await session({ customer_id: resolvedId });

  try {
    return await session({ external_customer_id: externalCustomerId });
  } catch (error) {
    if (!email) throw error;
    const found =
      (await findCustomerByEmail(email).catch(() => null)) ??
      (await createCustomer(email, externalCustomerId).catch(() => null));
    if (!found) throw error;
    return await session({ customer_id: found.id });
  }
}

/** Creates a Polar customer so the portal can be opened before any purchase. */
export function createCustomer(email: string, externalCustomerId?: string | null) {
  return polarFetch<PolarCustomer>("/customers/", {
    method: "POST",
    body: JSON.stringify({
      email,
      external_id: externalCustomerId ?? undefined,
    }),
  });
}

/* ------------------------------------------------------------------ */
/* Webhook endpoint management (POST/PATCH /v1/webhooks/endpoints)      */
/* ------------------------------------------------------------------ */

export type PolarWebhookEndpoint = {
  id: string;
  url: string;
  name: string | null;
  format: "raw" | "discord" | "slack";
  secret: string;
  events: string[];
  enabled?: boolean;
};

/** Events this app reacts to. */
export const WEBHOOK_EVENTS = [
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "subscription.past_due",
  "order.created",
  "order.paid",
  "order.refunded",
  "customer.state_changed",
  "benefit_grant.created",
  "benefit_grant.updated",
  "benefit_grant.revoked",
] as const;

export async function listWebhookEndpoints() {
  const res = await polarFetch<{ items: PolarWebhookEndpoint[] }>("/webhooks/endpoints?limit=100");
  return res.items ?? [];
}

export function createWebhookEndpoint(input: {
  url: string;
  events?: readonly string[];
  name?: string;
}) {
  return polarFetch<PolarWebhookEndpoint>("/webhooks/endpoints", {
    method: "POST",
    body: JSON.stringify({
      url: input.url,
      name: input.name ?? "Baseerah",
      format: "raw",
      events: input.events ?? WEBHOOK_EVENTS,
    }),
  });
}

export function updateWebhookEndpoint(
  id: string,
  patch: { url?: string; events?: readonly string[]; name?: string; enabled?: boolean },
) {
  return polarFetch<PolarWebhookEndpoint>(`/webhooks/endpoints/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Pins the endpoint's signing secret so it matches the one stored in this app. */
export function setWebhookEndpointSecret(id: string, secret: string) {
  return polarFetch<PolarWebhookEndpoint>(`/webhooks/endpoints/${id}/secret`, {
    method: "PATCH",
    body: JSON.stringify({ secret }),
  });
}

export function deleteWebhookEndpoint(id: string) {
  return polarFetch<void>(`/webhooks/endpoints/${id}`, { method: "DELETE" });
}

/**
 * Creates or updates the endpoint for `url` so it listens to every event we
 * handle and signs with our stored secret. Idempotent.
 */
export async function syncWebhookEndpoint(url: string, secret?: string) {
  const existing = (await listWebhookEndpoints()).find((e) => e.url === url);
  const endpoint = existing
    ? await updateWebhookEndpoint(existing.id, {
        url,
        events: WEBHOOK_EVENTS,
        name: "Baseerah",
        enabled: true,
      })
    : await createWebhookEndpoint({ url });

  const signing = secret ?? polarWebhookSecret();
  if (signing && endpoint.secret !== signing) {
    await setWebhookEndpointSecret(endpoint.id, signing);
  }
  return { endpoint, created: !existing, server: polarServer() };
}

export function listWebhookDeliveries(endpointId?: string) {
  const q = endpointId ? `?endpoint_id=${endpointId}&limit=20` : "?limit=20";
  return polarFetch<{ items: unknown[] }>(`/webhooks/deliveries${q}`);
}

/* ------------------------------------------------------------------ */
/* Product ids                                                          */
/* ------------------------------------------------------------------ */

export type PolarProduct = {
  id: string;
  name: string;
  is_archived?: boolean;
  prices?: { amount_type?: string; price_amount?: number }[];
};

/** One product, for the /environment diagnostics check. */
export function getProduct(id: string) {
  return polarFetch<PolarProduct>(`/products/${id}`);
}

/* ------------------------------------------------------------------ */
/* Subscription listing (used by reconciliation)                        */
/* ------------------------------------------------------------------ */

export type PolarSubscription = {
  id: string;
  status: string;
  product_id?: string | null;
  product?: { id?: string; name?: string } | null;
  current_period_end?: string | null;
  metadata?: Record<string, string> | null;
  customer?: {
    id?: string;
    email?: string | null;
    external_id?: string | null;
  } | null;
};

/** Every subscription in the organization, following pagination. */
export async function listAllSubscriptions(): Promise<PolarSubscription[]> {
  const out: PolarSubscription[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await polarFetch<{
      items: PolarSubscription[];
      pagination?: { max_page?: number };
    }>(`/subscriptions?limit=100&page=${page}`);
    out.push(...(res.items ?? []));
    const max = res.pagination?.max_page ?? 1;
    if (page >= max || (res.items ?? []).length === 0) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Email-keyed lookups (reconciliation + signup gating)                 */
/* ------------------------------------------------------------------ */

export type PolarCustomer = {
  id: string;
  email: string;
  name?: string | null;
  external_id?: string | null;
};

/** Finds a Polar customer by email address (case-insensitive). */
export async function findCustomerByEmail(email: string): Promise<PolarCustomer | null> {
  const res = await polarFetch<{ items: PolarCustomer[] }>(
    `/customers?limit=10&email=${encodeURIComponent(email)}`,
  );
  const target = email.trim().toLowerCase();
  return (res.items ?? []).find((c) => (c.email ?? "").toLowerCase() === target) ?? null;
}

/** The most relevant Polar subscription for an email, if any. */
export async function findSubscriptionByEmail(email: string): Promise<PolarSubscription | null> {
  const customer = await findCustomerByEmail(email);
  if (!customer) return null;
  const res = await polarFetch<{ items: PolarSubscription[] }>(
    `/subscriptions?limit=50&customer_id=${encodeURIComponent(customer.id)}`,
  );
  const items = (res.items ?? []).map((s) => ({
    ...s,
    customer: s.customer ?? {
      id: customer.id,
      email: customer.email,
      external_id: customer.external_id ?? null,
    },
  }));
  const rank = (s: PolarSubscription) =>
    s.status === "active" ? 0 : s.status === "trialing" ? 1 : s.status === "past_due" ? 2 : 3;
  return items.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
