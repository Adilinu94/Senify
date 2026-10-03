import { describe, expect, it } from "vitest";
import { publicBaseUrl, publicHost } from "../src/public-url.ts";

describe("publicBaseUrl", () => {
  it("defaults to the hosted subdomain of the slug", () => {
    expect(publicBaseUrl("demo-studio", {})).toBe("https://demo-studio.senify.xyz");
  });

  it("takes a template with the slug from SENIFY_PUBLIC_BASE_URL", () => {
    const env = { SENIFY_PUBLIC_BASE_URL: "https://{slug}.example.com/" };
    expect(publicBaseUrl("kunde", env)).toBe("https://kunde.example.com");
  });

  it("takes a fixed address for a single self-hosted site", () => {
    const env = { SENIFY_PUBLIC_BASE_URL: "https://www.example.com" };
    expect(publicBaseUrl("kunde", env)).toBe("https://www.example.com");
    expect(publicHost("kunde", env)).toBe("www.example.com");
  });

  it("keeps a path prefix but drops trailing slashes", () => {
    const env = { SENIFY_PUBLIC_BASE_URL: "https://example.com/sites/{slug}/" };
    expect(publicBaseUrl("kunde", env)).toBe("https://example.com/sites/kunde");
  });

  it("ignores a value that is not an http(s) URL", () => {
    expect(publicBaseUrl("kunde", { SENIFY_PUBLIC_BASE_URL: "not a url" })).toBe("https://kunde.senify.xyz");
    expect(publicBaseUrl("kunde", { SENIFY_PUBLIC_BASE_URL: "javascript:alert(1)" })).toBe(
      "https://kunde.senify.xyz",
    );
    expect(publicBaseUrl("kunde", { SENIFY_PUBLIC_BASE_URL: "   " })).toBe("https://kunde.senify.xyz");
  });
});
