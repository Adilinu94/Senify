import { describe, expect, it } from "vitest";
import {
  deepLinksEqual,
  DEFAULT_DEEP_LINK,
  parseDeepLink,
  serializeDeepLink,
} from "@senify/editor";

describe("deep links (?page=&node=&mode=&bp=)", () => {
  it("reads a full link", () => {
    expect(parseDeepLink("?page=pg1&node=hero1&mode=live&bp=tablet")).toEqual({
      page: "pg1",
      node: "hero1",
      mode: "live",
      bp: "tablet",
    });
  });

  it("falls back to design/desktop and tolerates junk", () => {
    expect(parseDeepLink("")).toEqual(DEFAULT_DEEP_LINK);
    expect(parseDeepLink("?mode=kaputt&bp=huge")).toEqual(DEFAULT_DEEP_LINK);
    expect(parseDeepLink("?unknown=1&page=")).toEqual(DEFAULT_DEEP_LINK);
    expect(parseDeepLink("??page=a")).toEqual({ ...DEFAULT_DEEP_LINK, page: "a" });
  });

  it("accepts a full URL and a bare query string", () => {
    expect(
      parseDeepLink("http://localhost:4321/admin/editor?page=pg1&mode=live"),
    ).toEqual({ ...DEFAULT_DEEP_LINK, page: "pg1", mode: "live" });
    expect(parseDeepLink("page=pg2&bp=mobile")).toEqual({
      ...DEFAULT_DEEP_LINK,
      page: "pg2",
      bp: "mobile",
    });
  });

  it("serializes without the defaults so links stay short", () => {
    expect(serializeDeepLink(DEFAULT_DEEP_LINK)).toBe("");
    expect(serializeDeepLink({ ...DEFAULT_DEEP_LINK, page: "pg1" })).toBe("page=pg1");
    expect(
      serializeDeepLink({ page: "pg1", node: "hero1", mode: "live", bp: "mobile" }),
    ).toBe("page=pg1&node=hero1&mode=live&bp=mobile");
  });

  it("round-trips and compares", () => {
    const link = { page: "pg1", node: "hero1", mode: "live" as const, bp: "tablet" as const };
    expect(parseDeepLink(serializeDeepLink(link))).toEqual(link);
    expect(deepLinksEqual(link, parseDeepLink(serializeDeepLink(link)))).toBe(true);
    expect(deepLinksEqual(link, DEFAULT_DEEP_LINK)).toBe(false);
  });
});
