import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Connect the signed-in user's own Gmail account. */
export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { googleAuthorizeUrl } = await import("@/server/googleOAuth.server");
    const { assertOAuthOriginUsable, resolveAppOrigin, redirectUri } =
      await import("@/server/appOrigin");

    // Fail here, on the click, rather than at Google's consent screen with a
    // bare redirect_uri_mismatch.
    assertOAuthOriginUsable(resolveAppOrigin());
    const { GMAIL_SCOPES } = await import("@/server/gmail.server");
    const { signOAuthState } = await import("@/server/oauthState");

    const authorizationUrl = googleAuthorizeUrl({
      redirectUri: redirectUri(),
      scopes: GMAIL_SCOPES,
      state: signOAuthState(context.userId),
    });
    return { authorizationUrl };
  });

/** Exchange the one-time OAuth code and store the per-user refresh token. */
export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { exchangeGoogleCode } = await import("@/server/googleOAuth.server");
    const { redirectUri } = await import("@/server/appOrigin");
    const { GMAIL_CONNECTOR_ID, gmailProfile } = await import("@/server/gmail.server");
    const { saveConnectionKeyForUser, setAccountLabel } =
      await import("@/server/appUserConnections.server");
    const { verifyOAuthState } = await import("@/server/oauthState");

    if (!verifyOAuthState(data.state, context.userId)) {
      throw new Error("This Gmail connection link is invalid or expired. Start the connect again.");
    }

    const { refreshToken } = await exchangeGoogleCode(data.code, redirectUri());
    await saveConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID, refreshToken);

    let email: string | null = null;
    try {
      email = (await gmailProfile(refreshToken)).emailAddress ?? null;
      if (email) await setAccountLabel(context.userId, GMAIL_CONNECTOR_ID, email);
    } catch {
      // Label is cosmetic — the connection itself is stored.
    }
    return { ok: true, email };
  });

export const getGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { GMAIL_CONNECTOR_ID } = await import("@/server/gmail.server");
    const { getConnectionRowForUser } = await import("@/server/appUserConnections.server");
    const row = await getConnectionRowForUser(context.userId, GMAIL_CONNECTOR_ID);
    return {
      connected: Boolean(row),
      email: row?.account_label ?? null,
      connectedAt: row?.updated_at ?? null,
    };
  });

export const scanGmailInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        max: z.number().int().min(1).max(100).optional(),
        skipMessageIds: z.array(z.string()).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { GMAIL_CONNECTOR_ID, scanGmailForDecks } = await import("@/server/gmail.server");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const refreshToken = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (!refreshToken) throw new Error("Gmail is not connected for this account.");
    return scanGmailForDecks(refreshToken, {
      ...(data.max !== undefined ? { max: data.max } : {}),
      ...(data.skipMessageIds ? { skipMessageIds: data.skipMessageIds } : {}),
    });
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeGoogleToken } = await import("@/server/googleOAuth.server");
    const { GMAIL_CONNECTOR_ID } = await import("@/server/gmail.server");
    const { deleteConnectionForUser, getConnectionKeyForUser } =
      await import("@/server/appUserConnections.server");
    const refreshToken = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (refreshToken) {
      try {
        await revokeGoogleToken(refreshToken);
      } catch {
        // Google may already have dropped the grant — still clear our row.
      }
    }
    await deleteConnectionForUser(context.userId, GMAIL_CONNECTOR_ID);
    return { ok: true };
  });
