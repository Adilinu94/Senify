import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { SenifyError } from "@senify/core";
import { hashToken, type Store } from "@senify/engine";

export type ProgramTokenFile = {
  id: string;
  secret: string;
  version: 1;
};

export function programTokenPath(home?: string): string {
  const root = home ?? process.env.USERPROFILE ?? process.env.HOME;
  if (!root) {
    throw new SenifyError("auth", "Kein Benutzerverzeichnis für den Programm-Token gefunden");
  }
  return join(root, ".senify", "program-token.json");
}

export function readProgramToken(path: string): ProgramTokenFile | undefined {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<ProgramTokenFile>;
    if (value.version !== 1 || typeof value.id !== "string" || typeof value.secret !== "string") {
      return undefined;
    }
    return { id: value.id, secret: value.secret, version: 1 };
  } catch {
    return undefined;
  }
}

function writeProgramToken(path: string, value: ProgramTokenFile): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

export async function ensureOperatorToken(input: {
  store: Store;
  path: string;
  reset?: boolean;
}): Promise<string> {
  const saved = input.reset ? undefined : readProgramToken(input.path);
  if (saved) {
    const record = await input.store.findTokenByHash(hashToken(saved.secret));
    if (!record) {
      throw new SenifyError("auth", "Der gespeicherte Programm-Token existiert nicht mehr", {
        suggestion: "Starte Senify mit einem expliziten Token-Reset oder entferne die Token-Datei.",
      });
    }
    if (record.revokedAt !== null || (record.expiresAt !== null && Date.parse(record.expiresAt) <= Date.now())) {
      throw new SenifyError("auth", "Der gespeicherte Programm-Token ist nicht mehr gültig", {
        suggestion: "Starte Senify mit einem expliziten Token-Reset oder entferne die Token-Datei.",
      });
    }
    if (record.kind !== "human") {
      if (record.id !== saved.id || record.name !== "Programm") {
        throw new SenifyError("auth", "Die Token-Datei gehört nicht zum Programm-Token", {
          suggestion: "Starte Senify mit einem expliziten Token-Reset.",
        });
      }
      await input.store.updateTokenKind(record.id, "human");
    }
    return saved.secret;
  }

  const created = await input.store.createToken({
    name: "Programm",
    kind: "human",
    scopes: ["read", "write", "publish"],
    expiresAt: null,
  });
  try {
    writeProgramToken(input.path, { id: created.token.id, secret: created.secret, version: 1 });
  } catch {
    await input.store.revokeToken(created.token.id);
    throw new SenifyError("auth", "Der Programm-Token konnte nicht sicher gespeichert werden", {
      suggestion: "Prüfe die Schreibberechtigung für das Konfigurationsverzeichnis.",
    });
  }
  return created.secret;
}
