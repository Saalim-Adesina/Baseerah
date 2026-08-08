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

export function azureDeployment() {
  return requireEnv("AZURE_FOUNDRY_DEPLOYMENT");
}

/**
 * AI SDK provider pointing at an Azure AI Foundry / Azure OpenAI deployment.
 * The model id passed to the provider is ignored by Azure — the deployment in
 * the URL selects the model — but we still pass the deployment name for logs.
 */
export function createAzureFoundryProvider() {
  const endpoint = trimSlash(requireEnv("AZURE_FOUNDRY_ENDPOINT"));
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

/** Raw Azure OpenAI chat completion, for multimodal bodies the SDK can't express. */
export async function azureChatCompletion(body: Record<string, unknown>) {
  const endpoint = trimSlash(requireEnv("AZURE_FOUNDRY_ENDPOINT"));
  const apiKey = requireEnv("AZURE_FOUNDRY_API_KEY");
  const deployment = azureDeployment();

  const response = await fetch(
    `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Azure AI Foundry request failed [${response.status}]: ${await response.text()}`,
    );
  }

  return (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
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
  };
};

/**
 * Runs Azure AI Document Intelligence `prebuilt-layout` over a document and
 * returns markdown preserving headings, tables and reading order.
 */
export async function analyzeDocumentLayout(base64Source: string) {
  const endpoint = trimSlash(requireEnv("AZURE_DOC_INTELLIGENCE_ENDPOINT"));
  const key = requireEnv("AZURE_DOC_INTELLIGENCE_KEY");

  const submit = await fetch(
    `${endpoint}/documentintelligence/documentModels/prebuilt-layout:analyze` +
      `?api-version=${DOC_INTELLIGENCE_API_VERSION}&outputContentFormat=markdown`,
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
      if (!content.trim()) {
        throw new Error("Document Intelligence returned no readable content for this file.");
      }
      return content;
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
