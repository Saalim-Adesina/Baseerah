import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { azureDeployment, createAzureFoundryProvider } from "@/lib/azure.server";
import { HOUSE_RULES, dealDossier, thesisBlock } from "@/lib/prompts.server";
import type { Deal, Thesis } from "@/lib/types";


type ChatRequestBody = {
  messages?: unknown;
  deal?: Deal;
  thesis?: Thesis;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        if (!Array.isArray(body.messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const deal = body.deal;
        const thesis = body.thesis;

        const system = `${HOUSE_RULES}

${thesis ? thesisBlock(thesis) : ""}

${deal ? `=== DEAL UNDER DISCUSSION ===\n${dealDossier(deal)}` : ""}

${
  deal?.analysis
    ? `=== EXISTING SCREENING ANALYSIS (JSON) ===\n${JSON.stringify(deal.analysis).slice(0, 20000)}`
    : ""
}

You are chatting with the investment team about this deal. Answer in markdown, be concise and specific, cite whether something is verified or founder-asserted, and flag missing information rather than inventing it.`;

        let azure: ReturnType<typeof createAzureFoundryProvider>;
        let deployment: string;
        try {
          azure = createAzureFoundryProvider();
          deployment = azureDeployment();
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : "Azure AI Foundry is not configured",
            { status: 500 },
          );
        }

        const result = streamText({
          model: azure(deployment),

          temperature: thesis?.temperature ?? 0.35,
          system,
          messages: await convertToModelMessages(body.messages as UIMessage[]),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: body.messages as UIMessage[],
        });
      },
    },
  },
});
