import { createServerFn } from "@tanstack/react-start";
import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";
import {
  analyzeDocumentLayout,
  azureDeployment,
  createAzureFoundryProvider,
  supportsDocumentIntelligence,
} from "./azure.server";
import { analysisPrompt, dealDossier, thesisBlock, HOUSE_RULES } from "./prompts.server";
import type { Deal, Thesis } from "./types";


const dealSchema = z.object({}).passthrough();
const thesisSchema = z.object({}).passthrough();

const analysisSchema = z.object({
  overallScore: z.number(),
  recommendation: z.string(),
  headline: z.string(),
  roundFitNote: z.string(),
  thesisFit: z.string(),
  metrics: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      score: z.number(),
      verdict: z.string(),
      evidence: z.string(),
      gap: z.string(),
    }),
  ),
  humanCapital: z.object({
    score: z.number(),
    founderMarketFit: z.string(),
    linkedinRead: z.string(),
    meetingNotesRead: z.string(),
    biasCheck: z.string(),
    concerns: z.array(z.string()),
  }),
  productMarketFit: z.string(),
  unitEconomics: z.object({
    read: z.string(),
    benchmarks: z.string(),
    flags: z.array(z.string()),
  }),
  moat: z.object({
    read: z.string(),
    durability: z.string(),
    sources: z.array(z.string()),
  }),
  competitors: z.array(
    z.object({
      name: z.string(),
      positioning: z.string(),
      threatLevel: z.string(),
      differentiation: z.string(),
    }),
  ),
  missingInformation: z.array(z.string()),
  founderQuestions: z.array(z.string()),
  risks: z.array(z.string()),
  killCriteria: z.array(z.string()),
});

export const analyzeDeal = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ deal: dealSchema, thesis: thesisSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const gateway = createLovableAiGatewayProvider(requireApiKey());

    const { text } = await generateText({
      model: gateway(CHAT_MODEL),
      temperature: thesis.temperature ?? 0.35,
      prompt: `${analysisPrompt(deal, thesis)}

Return ONLY the raw JSON object described above. No markdown fences, no commentary.`,
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("The screening model did not return usable JSON.");
    const parsed = analysisSchema.partial().parse(JSON.parse(match[0]));
    if (!parsed.metrics?.length) {
      throw new Error("The screening model returned no metric scores. Try re-running.");
    }
    return parsed;
  });


export const generateMemo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ deal: dealSchema, thesis: thesisSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const gateway = createLovableAiGatewayProvider(requireApiKey());

    const { text } = await generateText({
      model: gateway(CHAT_MODEL),
      temperature: thesis.temperature ?? 0.35,
      prompt: `${HOUSE_RULES}

=== FUND CONTEXT ===
${thesisBlock(thesis)}

=== DEAL DOSSIER ===
${dealDossier(deal)}

=== SCREENING ANALYSIS (JSON) ===
${JSON.stringify(deal.analysis ?? {}, null, 2)}

=== TASK ===
Write the Investment Committee memo in markdown for ${thesis.fundName}, authored by ${thesis.partnerName}.
Structure: Recommendation & ask; Company overview; Why now; The team (lead with people — this is the most important section); Product & technology; Market & competition; Traction and unit economics calibrated to the ${deal.round} stage; Moat and defensibility; Scoring summary table (metric | score /10 | rationale); Key risks and mitigants; Open diligence items; Questions for the founders; Proposed next steps.
Be specific, cite whether each claim is verified or founder-asserted, and never invent data.`,
    });

    return { memo: text };
  });

export const generatePassEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ deal: dealSchema, thesis: thesisSchema, tone: z.string().optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const gateway = createLovableAiGatewayProvider(requireApiKey());

    try {
      const { output } = await generateText({
        model: gateway(CHAT_MODEL),
        temperature: 0.4,
        output: Output.object({
          schema: z.object({ subject: z.string(), body: z.string() }),
        }),
        prompt: `${HOUSE_RULES}

=== FUND CONTEXT ===
${thesisBlock(thesis)}

=== DEAL DOSSIER ===
${dealDossier(deal)}

=== ANALYSIS (JSON) ===
${JSON.stringify(deal.analysis ?? {}, null, 2)}

=== TASK ===
Write a pass email to the founders of ${deal.company} from ${thesis.partnerName} at ${thesis.fundName}.
Tone: ${data.tone || "warm, direct, respectful"}.
It must: thank them concretely, give the two or three real reasons for passing (specific to this company and our thesis, not boilerplate), state clearly what would make us revisit (measurable milestones), and offer to stay in touch. No hedging, no false promises, under 220 words. Return the subject line and the body text separately.`,
      });
      return output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error) && error.text) {
        return { subject: `Following up on ${deal.company}`, body: error.text };
      }
      throw error;
    }
  });

export const extractDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string(),
        mimeType: z.string(),
        dataUrl: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const key = requireApiKey();
    const isImage = data.mimeType.startsWith("image/");

    const content = [
      {
        type: "text",
        text: "Transcribe this startup document into clean, structured markdown. Capture every slide/section heading, all numbers, metrics, charts (describe the values), team bios and financials. Do not summarise or editorialise — extract faithfully.",
      },
      isImage
        ? { type: "image_url", image_url: { url: data.dataUrl } }
        : {
            type: "file",
            file: { filename: data.filename, file_data: data.dataUrl },
          },
    ];

    const response = await fetch(`${GATEWAY_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Document extraction failed [${response.status}]: ${body}`);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { text: json.choices?.[0]?.message?.content ?? "" };
  });
