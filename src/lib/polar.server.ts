/** Polar API client. Talks to the sandbox when POLAR_SERVER=sandbox. */

const HOSTS = {
  production: "https://api.polar.sh/v1",
  sandbox: "https://sandbox-api.polar.sh/v1",
} as const;

export type PolarServer = keyof typeof HOSTS;

export function polarServer(): PolarServer {
  return process.env["POLAR_SERVER"] === "sandbox" ? "sandbox" : "production";
}

function apiBase() {
  return HOSTS[polarServer()];
}

function token() {
  const sandbox = polarServer() === "sandbox";
  const t = sandbox
    ? (process.env["POLAR_SANDBOX_ACCESS_TOKEN"] ?? process.env["POLAR_ACCESS_TOKEN"])
    : process.env["POLAR_ACCESS_TOKEN"];
  if (!t)
    throw new Error(
      sandbox
        ? "POLAR_SANDBOX_ACCESS_TOKEN is not configured"
        : "POLAR_ACCESS_TOKEN is not configured",
    );
  return t;
}

/** Webhook signing secret for the active environment. */
export function polarWebhookSecret() {
  return polarServer() === "sandbox"
    ? (process.env["POLAR_SANDBOX_WEBHOOK_SECRET"] ?? process.env["POLAR_WEBHOOK_SECRET"])
    : process.env["POLAR_WEBHOOK_SECRET"];
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
}) {
  return polarFetch<PolarCheckout>("/checkouts/", {
    method: "POST",
    body: JSON.stringify({
      products: [input.productId],
      external_customer_id: input.externalCustomerId,
      customer_email: input.customerEmail ?? undefined,
      success_url: input.successUrl,
      metadata: input.metadata,
    }),
  });
}

export function getCheckoutSession(id: string) {
  return polarFetch<PolarCheckout>(`/checkouts/${id}`);
}

export function createPortalSession(externalCustomerId: string) {
  return polarFetch<{ customer_portal_url: string }>("/customer-sessions/", {
    method: "POST",
    body: JSON.stringify({ external_customer_id: externalCustomerId }),
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
  const res = await polarFetch<{ items: PolarWebhookEndpoint[] }>(
    "/webhooks/endpoints?limit=100",
  );
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
      name: input.name ?? "Meridian",
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
        name: "Meridian",
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

/**
 * Sandbox products are distinct from live ones, so allow env overrides such as
 * POLAR_SANDBOX_PRODUCT_ANGEL / _SYNDICATE / _INSTITUTION / _EXTRA_SEAT.
 */
export function resolveProductId(key: string, fallback: string | null) {
  if (polarServer() === "sandbox") {
    const override = process.env[`POLAR_SANDBOX_PRODUCT_${key.toUpperCase()}`];
    if (override) return override;
  }
  return fallback;
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
