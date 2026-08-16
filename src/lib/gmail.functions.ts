import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Connect the signed-in user's own Gmail account (App User Connector). */
export const startGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL, GMAIL_CONNECTOR_ID, GMAIL_SCOPES } = await import(
      "@/server/gmail.server"
    );
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");

    const clientAPIKey = process.env["GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientAPIKey) {
      throw new Error("Gmail connector is not configured for this project.");
    }

    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost =
      url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL(
      "/oauth/gmail/return",
      sandboxHost ? `https://${sandboxHost}` : url.origin,
    ).toString();

    const existing = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GMAIL_CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GMAIL_SCOPES },
    });
    return { authorizationUrl };
  });

/** Exchange the one-time OAuth code and store the per-user connection key. */
export const completeGmailConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL, GMAIL_CONNECTOR_ID, gmailProfile } = await import(
      "@/server/gmail.server"
    );
    const { saveConnectionKeyForUser, setAccountLabel } = await import(
      "@/server/appUserConnections.server"
    );

    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== GMAIL_CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector.");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);

    let email: string | null = null;
    try {
      email = (await gmailProfile(connectionAPIKey)).emailAddress ?? null;
      if (email) await setAccountLabel(context.userId, connectorId, email);
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
  .inputValidator((input: unknown) =>
    z
      .object({
        max: z.number().int().min(1).max(25).optional(),
        skipMessageIds: z.array(z.string()).max(500).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { GMAIL_CONNECTOR_ID, scanGmailForDecks } = await import("@/server/gmail.server");
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (!connectionAPIKey) throw new Error("Gmail is not connected for this account.");
    return scanGmailForDecks(connectionAPIKey, {
      ...(data.max !== undefined ? { max: data.max } : {}),
      ...(data.skipMessageIds ? { skipMessageIds: data.skipMessageIds } : {}),
    });
  });

export const disconnectGmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const { GATEWAY_BASE_URL, GMAIL_CONNECTOR_ID } = await import("@/server/gmail.server");
    const { deleteConnectionForUser, getConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (connectionAPIKey) {
      try {
        await disconnectAppUser({
          gatewayBaseUrl: GATEWAY_BASE_URL,
          connectionAPIKey,
          connectorId: GMAIL_CONNECTOR_ID,
        });
      } catch {
        // Gateway may already have dropped it — still clear our row.
      }
    }
    await deleteConnectionForUser(context.userId, GMAIL_CONNECTOR_ID);
    return { ok: true };
  });
