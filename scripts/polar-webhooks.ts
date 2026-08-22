/**
 * Manage Polar webhook endpoints from the CLI.
 *
 *   POLAR_SERVER=sandbox POLAR_SANDBOX_ACCESS_TOKEN=... \
 *     bun scripts/polar-webhooks.ts sync https://your-domain.com/api/public/polar-webhook
 *
 * Commands: list | sync <url> | delete <id> | deliveries [endpointId]
 */
import {
  deleteWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
  polarServer,
  syncWebhookEndpoint,
} from "../src/lib/polar.server";

const [command, arg] = process.argv.slice(2);

function redact(secret: string) {
  return secret ? `${secret.slice(0, 4)}…${secret.slice(-2)}` : "";
}

const run = async () => {
  console.log(`Polar environment: ${polarServer()}`);
  switch (command) {
    case "list": {
      const items = await listWebhookEndpoints();
      console.table(
        items.map((e) => ({ id: e.id, url: e.url, events: e.events.length, secret: redact(e.secret) })),
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
