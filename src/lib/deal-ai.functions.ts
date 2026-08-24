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
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Deal, Thesis } from "./types";

/**
 * The prompt builders in `prompts.server.ts` read these fields unconditionally,
 * so every one of them must survive validation with a usable value. Defaults —
 * rather than `.optional()` — are what stop a partial payload from reaching the
 * model layer and failing with a raw `undefined` property read.
 * `.passthrough()` keeps forward compatibility with fields the UI adds later.
 */
const founderSchema = z
  .object({
    id: z.string().default(""),
    name: z.string().default(""),
    role: z.string().default(""),
    linkedin: z.string().default(""),
    background: z.string().default(""),
  })
  .passthrough();

const dealSchema = z
  .object({
    id: z.string().min(1),
    createdAt: z.number().default(() => Date.now()),
    company: z.string().min(1, "A deal needs a company name."),
    website: z.string().default(""),
    oneLiner: z.string().default(""),
    sector: z.string().default(""),
    geography: z.string().default(""),
    round: z.string().default("Seed"),
    raising: z.string().default(""),
    valuation: z.string().default(""),
    traction: z.string().default(""),
    unitEconomics: z.string().default(""),
    competition: z.string().default(""),
    founders: z.array(founderSchema).default([]),
    meetingNotes: z.string().default(""),
    personalBias: z.string().default(""),
    deckText: z.string().default(""),
    deckFileName: z.string().default(""),
    status: z.string().default("new"),
    analysis: z.unknown().optional(),
  })
  .passthrough();

const thesisSchema = z
  .object({
    fundName: z.string().default("Our fund"),
    partnerName: z.string().default("Investment Team"),
    statement: z.string().default(""),
    preferredIndustries: z.string().default(""),
    antiPortfolio: z.string().default(""),
    stageFocus: z.string().default(""),
    checkSize: z.string().default(""),
    modelInstructions: z.string().default(""),
    temperature: z.number().min(0).max(2).default(0.35),
    // `thesisBlock` falls back to 0.5 per missing key, so an empty map is fine.
    weights: z.record(z.number()).default({}),
  })
  .passthrough();

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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ deal: dealSchema, thesis: thesisSchema }).parse(input))
  .handler(async ({ data, context }) => {
    // Metered before the model call so a refused account never reaches Azure.
    const { assertAndRecordScreening } = await import("./screening-quota.server");
    await assertAndRecordScreening(context.userId);

    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const azure = createAzureFoundryProvider();

    const { text } = await generateText({
      model: azure(azureDeployment()),
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ deal: dealSchema, thesis: thesisSchema }).parse(input))
  .handler(async ({ data }) => {
    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const azure = createAzureFoundryProvider();

    const { text } = await generateText({
      model: azure(azureDeployment()),
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
Structure: Recommendation & ask; Company overview; Why now; The team (lead with people — this is the most important section); Product & technology; Market & competition; Traction and unit economics calibrated to the ${deal.round} stage; Moat and defensibility; Scoring summary table; Key risks and mitigants (as a table); Open diligence items; Questions for the founders; Proposed next steps.

Table formatting (strict):
- "Scoring summary" and "Key risks and mitigants" MUST be GitHub-flavoured markdown pipe tables, never bullet lists or plain text.
- Scoring summary columns: | Metric | Score /10 | Rationale |
- Key risks columns: | Risk | Severity | Mitigant |
- Every table starts with a header row, then a separator row of dashes (e.g. | --- | --- | --- |), then one row per item. Each row on its own line, leading and trailing pipes included, no blank lines inside the table, and a blank line before and after the table.
- Keep cell text on a single line: no line breaks, no bullet characters, and escape any literal pipe as \\|.

Be specific, cite whether each claim is verified or founder-asserted, and never invent data.`,
    });

    return { memo: text };
  });

export const generatePassEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ deal: dealSchema, thesis: thesisSchema, tone: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const deal = data.deal as unknown as Deal;
    const thesis = data.thesis as unknown as Thesis;
    const azure = createAzureFoundryProvider();

    try {
      const { output } = await generateText({
        model: azure(azureDeployment()),
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        filename: z.string(),
        mimeType: z.string(),
        dataUrl: z.string(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!supportsDocumentIntelligence(data.mimeType, data.filename)) {
      throw new Error(
        "Document Intelligence cannot read this file type. Upload a PDF, DOCX, PPTX, XLSX, HTML or image.",
      );
    }

    const base64Source = data.dataUrl.includes(",")
      ? data.dataUrl.slice(data.dataUrl.indexOf(",") + 1)
      : data.dataUrl;
    if (!base64Source.trim()) throw new Error("The uploaded file appears to be empty.");

    const markdown = await analyzeDocumentLayout(base64Source);
    return { text: markdown };
  });
