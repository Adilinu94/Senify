// "Ask AI" is BYOK: the portal sends the question plus the best search hits to
// an OpenAI-compatible endpoint configured in /portal-config.json, and shows
// the answer with source links. No platform key, nothing server-side.
export type AskAiConfig = {
  endpoint: string;
  model: string;
  apiKey?: string;
};

export type AskAiContext = {
  path: string;
  title: string;
  excerpt: string;
};

export type AskAiRequest = {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    temperature: number;
    messages: { role: "system" | "user"; content: string }[];
  };
};

export function askAiRequest(
  config: AskAiConfig,
  question: string,
  context: AskAiContext[],
): AskAiRequest {
  const sources = context
    .map((hit) => `Quelle ${hit.path} (${hit.title}):\n${hit.excerpt}`)
    .join("\n\n");
  return {
    url: config.endpoint,
    headers: {
      "content-type": "application/json",
      ...(config.apiKey === undefined || config.apiKey === ""
        ? {}
        : { authorization: `Bearer ${config.apiKey}` }),
    },
    body: {
      model: config.model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Du beantwortest Fragen zur Senify-Dokumentation. Antworte auf Deutsch mit englischen Fachbegriffen, kurz und konkret, und nenne die Quellen-Pfade, auf die sich die Antwort stützt.",
        },
        {
          role: "user",
          content: `${sources}\n\nFrage: ${question}`,
        },
      ],
    },
  };
}