import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { SenifyError } from "@senify/core";
import { assertImportRootAllowed } from "../src/imports.ts";

// ADR-0016: SENIFY_IMPORT_ROOTS limits the mirror folders an agent may import
// from. Unset keeps the folder open; set, the folder must be a root or below one.

let base: string;
let allowed: string;
let outside: string;

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "senify-roots-"));
  allowed = join(base, "erlaubt");
  outside = join(base, "erlaubt-fremd");
  mkdirSync(join(allowed, "mirror", "site"), { recursive: true });
  mkdirSync(outside);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(base, { recursive: true, force: true });
});

function refused(rootDir: string): void {
  try {
    assertImportRootAllowed(rootDir);
  } catch (error) {
    expect(error).toBeInstanceOf(SenifyError);
    expect((error as SenifyError).category).toBe("validation");
    expect((error as SenifyError).field).toBe("source.rootDir");
    expect((error as SenifyError).suggestion).toContain("SENIFY_IMPORT_ROOTS");
    return;
  }
  throw new Error(`Erwartet: ${rootDir} wird abgelehnt`);
}

describe("assertImportRootAllowed", () => {
  it("keeps every folder open while SENIFY_IMPORT_ROOTS is unset or empty", () => {
    expect(() => assertImportRootAllowed(outside)).not.toThrow();
    vi.stubEnv("SENIFY_IMPORT_ROOTS", "");
    expect(() => assertImportRootAllowed(outside)).not.toThrow();
    vi.stubEnv("SENIFY_IMPORT_ROOTS", `${delimiter} ${delimiter}`);
    expect(() => assertImportRootAllowed(outside)).not.toThrow();
  });

  it("accepts the root itself and folders below it", () => {
    vi.stubEnv("SENIFY_IMPORT_ROOTS", allowed);
    expect(() => assertImportRootAllowed(allowed)).not.toThrow();
    expect(() => assertImportRootAllowed(join(allowed, "mirror"))).not.toThrow();
    expect(() => assertImportRootAllowed(join(allowed, "mirror", "site"))).not.toThrow();
  });

  it("refuses a sibling that only shares the name prefix", () => {
    vi.stubEnv("SENIFY_IMPORT_ROOTS", allowed);
    refused(outside);
  });

  it("refuses a path that climbs out of the root with ..", () => {
    vi.stubEnv("SENIFY_IMPORT_ROOTS", allowed);
    refused(join(allowed, "mirror", "..", "..", "erlaubt-fremd"));
  });

  it("takes several roots separated by the platform delimiter", () => {
    vi.stubEnv("SENIFY_IMPORT_ROOTS", `${join(base, "andere")}${delimiter}${allowed}`);
    expect(() => assertImportRootAllowed(join(allowed, "mirror"))).not.toThrow();
    refused(outside);
  });

  it("resolves symlinks, so a link inside a root cannot lead out of it", (context) => {
    const link = join(allowed, "ausbruch");
    try {
      symlinkSync(outside, link, "junction");
    } catch {
      context.skip();
      return;
    }
    vi.stubEnv("SENIFY_IMPORT_ROOTS", allowed);
    refused(link);
  });

  it("does not leak the configured roots in the message", () => {
    vi.stubEnv("SENIFY_IMPORT_ROOTS", allowed);
    try {
      assertImportRootAllowed(outside);
    } catch (error) {
      expect((error as SenifyError).message).not.toContain(allowed);
      expect((error as SenifyError).suggestion ?? "").not.toContain(allowed);
      return;
    }
    throw new Error("Erwartet: Ablehnung");
  });
});
