import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Azure OpenAI data-plane API version used for chat completions. */
const AZURE_OPENAI_API_VERSION = "2024-10-21";
/** Azure AI Document Intelligence API version (GA). */
const DOC_INTELLIGENCE_API_VERSION = "2024-11-30";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not configured. Add it in project settings before running Azure screening.`,
    );
  }
  return value.trim();
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Foundry portal copies endpoints with a `/models` (or `/openai`) suffix.
 * The data-plane paths add their own prefix, so normalise it away.
 */
function foundryBaseUrl() {
  return trimSlash(requireEnv("AZURE_FOUNDRY_ENDPOINT")).replace(/\/(models|openai)$/i, "");
}

export function azureDeployment() {
  return requireEnv("AZURE_FOUNDRY_DEPLOYMENT");
}

/**
 * AI SDK provider pointing at an Azure AI Foundry / Azure OpenAI deployment.
 * The model id passed to the provider is ignored by Azure — the deployment in
 * the URL selects the model — but we still pass the deployment name for logs.
 */
export function createAzureFoundryProvider() {
  const endpoint = foundryBaseUrl();
  const apiKey = requireEnv("AZURE_FOUNDRY_API_KEY");
  const deployment = azureDeployment();

  return createOpenAICompatible({
    name: "azure-foundry",
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    supportsStructuredOutputs: true,
    headers: { "api-key": apiKey },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (!url.searchParams.has("api-version")) {
        url.searchParams.set("api-version", AZURE_OPENAI_API_VERSION);
      }
      return fetch(url.toString(), init);
    }) as typeof fetch,
  });
}

const DOC_INTELLIGENCE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/bmp",
  "image/tiff",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html",
]);

export function supportsDocumentIntelligence(mimeType: string, filename: string) {
  if (DOC_INTELLIGENCE_TYPES.has(mimeType)) return true;
  return /\.(pdf|jpe?g|png|bmp|tiff?|heif|docx|pptx|xlsx|html?)$/i.test(filename);
}

type AnalyzeResult = {
  status?: string;
  error?: { message?: string; code?: string };
  analyzeResult?: {
    content?: string;
    paragraphs?: { content?: string }[];
    figures?: {
      id?: string;
      caption?: { content?: string };
      boundingRegions?: { pageNumber?: number }[];
    }[];
  };
};

/** A chart, diagram or image crop lifted out of the document. */
export type DocumentFigure = {
  /** Document Intelligence figure id, conventionally `{page}.{index}`. */
  id: string;
  page: number | null;
  /** The document's own caption for the figure, where it has one. */
  caption: string;
  /** PNG crop, base64 encoded, ready to hand to a vision model. */
  base64: string;
};

/**
 * Charts and diagrams carry much of a pitch deck's substance, and layout OCR
 * reduces them to loose axis labels. Cropping every figure would be unbounded,
 * so take the first N in reading order — a deck front-loads what matters.
 */
const MAX_FIGURES = 14;

/**
 * Fetches one cropped figure image. Figures exist only because the analyze call
 * asked for `output=figures`, and only for rendered formats — PDF and images.
 * Office formats and HTML are never rendered, so they yield no figures at all.
 */
async function fetchFigure(
  endpoint: string,
  key: string,
  resultId: string,
  figureId: string,
): Promise<string | null> {
  const response = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout/analyzeResults/` +
      `${encodeURIComponent(resultId)}/figures/${encodeURIComponent(figureId)}` +
      `?api-version=${DOC_INTELLIGENCE_API_VERSION}`,
    { headers: { "Ocp-Apim-Subscription-Key": key } },
  );
  // A missing crop degrades the read; it must never fail the upload.
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength) return null;
  return Buffer.from(bytes).toString("base64");
}

/**
 * Runs Azure AI Document Intelligence `prebuilt-layout` over a document and
 * returns markdown preserving headings, tables and reading order, plus cropped
 * images of every figure it found so a vision model can read what OCR cannot.
 */
export async function analyzeDocumentLayout(
  base64Source: string,
): Promise<{ markdown: string; figures: DocumentFigure[] }> {
  const endpoint = trimSlash(requireEnv("AZURE_DOC_INTELLIGENCE_ENDPOINT"));
  const key = requireEnv("AZURE_DOC_INTELLIGENCE_KEY");

  const submit = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze` +
      `?api-version=${DOC_INTELLIGENCE_API_VERSION}&outputContentFormat=markdown&output=figures`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Ocp-Apim-Subscription-Key": key,
      },
      body: JSON.stringify({ base64Source }),
    },
  );

  if (!submit.ok) {
    throw new Error(
      `Document Intelligence rejected the file [${submit.status}]: ${await submit.text()}`,
    );
  }

  const operationLocation = submit.headers.get("operation-location");
  if (!operationLocation) {
    throw new Error("Document Intelligence did not return an operation location.");
  }
  const resultId = /\/analyzeResults\/([^/?]+)/.exec(operationLocation)?.[1] ?? "";

  const deadline = Date.now() + 4 * 60 * 1000;
  let delay = 1000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.4, 5000);

    const poll = await fetch(operationLocation, {
      headers: { "Ocp-Apim-Subscription-Key": key },
    });
    if (!poll.ok) {
      throw new Error(
        `Document Intelligence polling failed [${poll.status}]: ${await poll.text()}`,
      );
    }

    const result = (await poll.json()) as AnalyzeResult;
    if (result.status === "succeeded") {
      const content =
        result.analyzeResult?.content ??
        (result.analyzeResult?.paragraphs ?? [])
          .map((paragraph) => paragraph.content ?? "")
          .join("\n\n");

      const detected = (result.analyzeResult?.figures ?? []).filter((figure) => figure.id);
      const crops = await Promise.all(
        detected.slice(0, MAX_FIGURES).map(async (figure) => {
          const base64 = await fetchFigure(endpoint, key, resultId, figure.id as string);
          if (!base64) return null;
          return {
            id: figure.id as string,
            page: figure.boundingRegions?.[0]?.pageNumber ?? null,
            caption: figure.caption?.content?.trim() ?? "",
            base64,
          } satisfies DocumentFigure;
        }),
      );
      const figures = crops.filter((figure): figure is DocumentFigure => figure !== null);

      // A deck that is entirely images has no OCR text but plenty of figures,
      // and is still readable — only a file with neither is a dead end.
      if (!content.trim() && !figures.length) {
        throw new Error("Document Intelligence returned no readable content for this file.");
      }
      return { markdown: content, figures };
    }
    if (result.status === "failed") {
      throw new Error(
        `Document Intelligence could not analyse the document: ${
          result.error?.message ?? "unknown error"
        }`,
      );
    }
  }

  throw new Error("Document Intelligence timed out analysing this document.");
}
