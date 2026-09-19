import { describe, expect, it } from "vitest";
import { SCHEMA_STATEMENTS, jsonColumns, tableNames } from "../src/db.ts";

// The additive style rule column (Phase 2) arrives through ALTER TABLE, not
// through the CREATE TABLE. `jsonColumns` must still see it: a restore hands
// JSONB values back as JSON text, and a column the helper does not know would
// be passed to the driver as a bare object.
describe("schema helpers", () => {
  it("lists every table the schema owns", () => {
    const names = tableNames();
    expect(names).toContain("sites");
    expect(names).toContain("pages");
    expect(new Set(names).size).toBe(names.length);
  });

  it("sees a JSONB column declared inline", () => {
    const pages = jsonColumns("pages");
    expect(pages.has("meta")).toBe(true);
    expect(pages.has("draft")).toBe(true);
  });

  it("sees a JSONB column added by an additive ALTER", () => {
    const sites = jsonColumns("sites");
    expect(sites.has("style_rules_json")).toBe(true);
  });

  it("does not attribute one table's columns to another", () => {
    expect(jsonColumns("site_trash").size).toBe(0);
    expect(jsonColumns("pages").has("style_rules_json")).toBe(false);
  });

  it("declares the style rule column additively, never in the CREATE TABLE", () => {
    const sitesCreate = SCHEMA_STATEMENTS.find((statement) =>
      statement.includes("CREATE TABLE IF NOT EXISTS sites"),
    );
    expect(sitesCreate).toBeDefined();
    expect(sitesCreate).not.toContain("style_rules_json");
    const alter = SCHEMA_STATEMENTS.find((statement) =>
      statement.includes("ADD COLUMN IF NOT EXISTS style_rules_json"),
    );
    expect(alter).toBeDefined();
    expect(alter).toMatch(/jsonb/);
  });
});