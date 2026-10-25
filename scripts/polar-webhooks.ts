/**
 * Manage Polar webhook endpoints from the CLI.
 *
 *   npm run webhooks:list -- --env=sandbox
 *   npm run webhooks:sync -- --env=production https://www.baseerah.dev/api/public/polar-webhook
 *
 * Which Polar organisation is targeted comes from APP_ENV. Pass --env= to
 * override it for one command: the `APP_ENV=x npm run ...` prefix form does not
 * work in PowerShell, and this repo is developed on Windows.
 *
 * Commands: list | sync <url> | delete <id> | deliveries [endpointId]
 */
import {
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  polarApiBase,
  polarServer,
  syncWebhookEndpoint,
} from "../src/lib/polar.server.ts";

const argv = process.argv.slice(2);

// Applied before anything reads APP_ENV, so polarServer() and the credential
// lookups all resolve to the requested organisation.
const envFlag = argv.find((a) => a.startsWith("--env="))?.slice("--env=".length);
if (envFlag) {
  if (envFlag !== "production" && envFlag !== "sandbox") {
    console.error(`Unknown --env=${envFlag}. Expected "production" or "sandbox".`);
    process.exit(2);
  }
  process.env["APP_ENV"] = envFlag === "production" ? "production" : "preview";
}

const [command, arg] = argv.filter((a) => !a.startsWith("--env="));

function redact(secret: string) {
  return secret ? `${secret.slice(0, 4)}…${secret.slice(-2)}` : "";
}

const run = async () => {
  // Print what this command is actually pointed at — syncing the wrong
  // organisation is silent otherwise, and the endpoints look identical.
  console.log(
    `Polar environment: ${polarServer()} (APP_ENV=${process.env["APP_ENV"] ?? "unset -> preview"})`,
  );
  console.log(`API host: ${polarApiBase()}`);
  switch (command) {
    case "list": {
      const items = await listWebhookEndpoints();
      console.table(
        items.map((e) => ({
          id: e.id,
          url: e.url,
          events: e.events.length,
          secret: redact(e.secret),
        })),
      );
      break;
    }
    case "sync": {
      if (!arg) throw new Error("Usage: sync <url>");
      const { endpoint, created } = await syncWebhookEndpoint(arg);
      console.log(`${created ? "Created" : "Updated"} endpoint ${endpoint.id} -> ${endpoint.url}`);
      console.log(`Events: ${endpoint.events.join(", ")}`);
      break;
    }
    case "delete": {
      if (!arg) throw new Error("Usage: delete <endpointId>");
      await deleteWebhookEndpoint(arg);
      console.log(`Deleted ${arg}`);
      break;
    }
    case "deliveries": {
      console.log(JSON.stringify(await listWebhookDeliveries(arg), null, 2));
      break;
    }
    default:
      console.log("Commands: list | sync <url> | delete <id> | deliveries [endpointId]");
  }
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
