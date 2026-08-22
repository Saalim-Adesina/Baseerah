/**
 * Google OAuth 2.0 (installed-app "web application" client) helpers.
 *
 * Server-only. Replaces the hosted connector gateway that used to broker the
 * per-user Gmail connection: we now own the OAuth client, hold the refresh
 * token ourselves (encrypted, see `connectionKeyCrypto.ts`) and mint short-lived
 * access tokens on demand.
 *
 * Setup, once, in Google Cloud console:
 *   1. APIs & Services → Library → enable "Gmail API".
 *   2. APIs & Services → Credentials → Create credentials → OAuth client ID →
 *      Web application.
 *   3. Authorized redirect URIs: `<your app origin>/oauth/gmail/return`
 *      (add every origin you use, production and localhost).
 *   4. Put the client id/secret in GOOGLE_OAUTH_CLIENT_ID /
 *      GOOGLE_OAUTH_CLIENT_SECRET.
 *   5. OAuth consent screen: add the scopes in GMAIL_SCOPES. `gmail.readonly`
 *      is a restricted scope — while the app is in "Testing" only listed test
 *      users can connect; publishing requires Google's verification review.
 */
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured. Gmail connect needs your own Google OAuth client.`);
  }
  return value.trim();
}

function clientId() {
  return requireEnv("GOOGLE_OAUTH_CLIENT_ID");
}

function clientSecret() {
  return requireEnv("GOOGLE_OAUTH_CLIENT_SECRET");
}

/** Consent URL. `state` is echoed back to the redirect URI unchanged. */
export function googleAuthorizeUrl(params: {
  redirectUri: string;
  scopes: string[];
  state: string;
  loginHint?: string;
}) {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  // offline + consent is what actually returns a refresh token; without the
  // forced consent Google omits it on every re-authorisation after the first.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const text = await res.text();
  let payload: TokenResponse;
  try {
    payload = text ? (JSON.parse(text) as TokenResponse) : {};
  } catch {
    throw new Error(`Google token endpoint returned invalid JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok || payload.error) {
    throw new Error(
      `Google token request failed (${res.status}): ${payload.error_description ?? payload.error ?? text.slice(0, 200)}`,
    );
  }
  return payload;
}

/** Swap the one-time redirect `code` for a long-lived refresh token. */
export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const payload = await tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!payload.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app at myaccount.google.com/permissions and connect again.",
    );
  }
  return {
    refreshToken: payload.refresh_token,
    accessToken: payload.access_token ?? "",
    expiresIn: payload.expires_in ?? 0,
  };
}

// Access tokens live ~1h; a scan makes many calls, so cache per refresh token
// instead of paying a token round-trip on each one. Process-local by design —
// a cold serverless instance just mints a new one.
const accessTokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function googleAccessToken(refreshToken: string) {
  const cached = accessTokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const payload = await tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
  if (!payload.access_token) throw new Error("Google refresh returned no access token.");

  accessTokenCache.set(refreshToken, {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });
  return payload.access_token;
}

/** Drops Google's side of the grant. Safe to call on an already-dead token. */
export async function revokeGoogleToken(token: string) {
  accessTokenCache.delete(token);
  await fetch(REVOKE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
}
