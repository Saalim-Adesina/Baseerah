// Shared bearer-token authentication for anything that receives a raw Request.
//
// `requireSupabaseAuth` (auth-middleware.ts) covers server functions, but raw
// route handlers such as `/api/chat` cannot take server-function middleware.
// Both paths go through `authenticateRequest` so there is exactly one place
// that decides what a valid session looks like.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/**
 * Supabase's new opaque API keys are not bearer JWTs. When the SDK defaults the
 * Authorization header to the api key we strip it, so the caller's own token is
 * the only thing PostgREST sees.
 */
export function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

export function supabaseRequestConfig() {
  const url = process.env["SUPABASE_URL"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !publishableKey) {
    const missing = [
      ...(!url ? ["SUPABASE_URL"] : []),
      ...(!publishableKey ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(
      ", ",
    )}. Set them in your hosting environment (see .env.example).`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  return { url, publishableKey };
}

/** Builds a Supabase client that acts as the token holder, so RLS applies. */
export function clientForToken(token: string): SupabaseClient<Database> {
  const { url, publishableKey } = supabaseRequestConfig();
  return createClient<Database>(url, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type AuthenticatedRequest = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
};

/** Thrown reasons are deliberately vague — never tell a caller which check failed. */
export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Validates the `Authorization: Bearer <jwt>` header against Supabase Auth.
 * Throws `UnauthorizedError` when the request carries no usable session.
 */
export async function authenticateRequest(
  request: Request | undefined,
): Promise<AuthenticatedRequest> {
  if (!request?.headers) throw new UnauthorizedError("Unauthorized: No request headers available");

  const authHeader = request.headers.get("authorization");
  if (!authHeader) throw new UnauthorizedError("Unauthorized: No authorization header provided");
  if (!authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new UnauthorizedError("Unauthorized: No token provided");
  if (token.split(".").length !== 3) throw new UnauthorizedError("Unauthorized: Invalid token");

  const supabase = clientForToken(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims) throw new UnauthorizedError("Unauthorized: Invalid token");
  if (!data.claims.sub) throw new UnauthorizedError("Unauthorized: No user ID found in token");

  return { supabase, userId: data.claims.sub, claims: data.claims };
}
