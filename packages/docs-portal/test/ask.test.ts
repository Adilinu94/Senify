import { describe, expect, it } from "vitest";
import { askAiRequest } from "@senify/docs-portal";

const context = [
  { path: "/reference/tools", title: "Tools", excerpt: "apply_mutations ist der Batch-Schreibweg." },
];

describe("Ask AI request (BYOK)", () => {
  it("builds an OpenAI-compatible request with context and sources", () => {
    const request = askAiRequest(
      { endpoint: "https://llm.example/v1/chat/completions", model: "m1" },
      "Wie schreibe ich Änderungen?",
      context,
    );
    expect(request.url).toBe("https://llm.example/v1/chat/completions");
    expect(request.headers["content-type"]).toBe("application/json");
    expect(request.headers["authorization"]).toBeUndefined();
    expect(request.body.model).toBe("m1");
    const user = request.body.messages.find((message) => message.role === "user");
    expect(user?.content).toContain("/reference/tools");
    expect(user?.content).toContain("Wie schreibe ich Änderungen?");
  });

  it("adds the bearer header only when a key is configured", () => {
    const request = askAiRequest(
      { endpoint: "https://llm.example/v1/chat/completions", model: "m1", apiKey: "sk-test" },
      "Frage",
      context,
    );
    expect(request.headers["authorization"]).toBe("Bearer sk-test");
  });
});