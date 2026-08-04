const POLAR_API = "https://api.polar.sh/v1";

function token() {
  const t = process.env["POLAR_ACCESS_TOKEN"];
  if (!t) throw new Error("POLAR_ACCESS_TOKEN is not configured");
  return t;
}

async function polarFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${POLAR_API}${path}`, {
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
