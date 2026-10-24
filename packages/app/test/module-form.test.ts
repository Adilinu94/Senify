import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Der Split der Oberflaeche (PR #84) hat den Code vollstaendig uebernommen,
// aber beim Ausschneiden jede Zeile mit einer Leerzeile umgeben und
// Kommentarbloecke an den Schnittkanten doppelt geschrieben. Beides faellt
// keinem Test auf - der Code laeuft. Diese Pruefung liest die Quellen und
// haelt die Form fest, die der Code vorher hatte.
//
// Die Regel stammt aus `app.js` vor dem Split: dort folgen 96,5 % der
// aufeinanderfolgenden Codezeilen direkt aufeinander, und kein Kommentarblock
// steht zweimal.
const MODULE: string[] = [
  "app-core.js",
  "app-projects.js",
  "app-references.js",
  "app-editor.js",
  "app-editor-protocol.js",
  "app-editor-redesign-inbox.js",
  "app-editor-bake-status.js",
  "app-review.js",
  "app-import.js",
  "app-markdown.js",
  "app-articles.js",
  "app-refs-dialog.js",
  "app-refs-settings.js",
  'app-refs-icons.js',
  'app-refs-state.js',
  'app-refs-collections.js',
  'app-refs-add.js',
  'app-refs-inspector.js',
  'app-refs-shell.js',
  'app-refs-cards.js',
  'app-library.js',
  'app-settings.js',
  'app-workspace.js',
  'app-workspace-submissions.js',
  'app-workspace-templates.js',
  'app-workspace-settings.js',
  'app-workspace-lists.js',
  'app-framer-import.js',
  "app.js",
];

const lies = (f: string): string[] => readFileSync(new URL(`../public/${f}`, import.meta.url), "utf8").split(/\r?\n/);
const istKommentar = (l: string): boolean => /^\s*\/\//.test(l);
const istImport = (l: string): boolean => /^import |^\} from /.test(l);
const leer = (l: string | undefined): boolean => l === undefined || l.trim() === "";

describe("Oberflaeche: die Form der Module", () => {
  it("hat keine zwei Leerzeilen hintereinander", () => {
    const fund: string[] = [];
    for (const f of MODULE) {
      const zeilen = lies(f);
      for (let i = 1; i < zeilen.length; i++) {
        if (leer(zeilen[i]) && leer(zeilen[i - 1])) fund.push(`${f}:${i + 1}`);
      }
    }
    expect(fund).toEqual([]);
  });

  it("wiederholt keinen Kommentarblock innerhalb einer Datei", () => {
    const fund: string[] = [];
    for (const f of MODULE) {
      const zeilen = lies(f);
      const bloecke: string[][] = [];
      let cur: string[] | null = null;
      for (const l of zeilen) {
        if (istKommentar(l)) {
          if (!cur) cur = [];
          cur.push(l.trim());
        } else if (l.trim() === "" && cur) {
          bloecke.push(cur);
          cur = null;
        } else if (cur) {
          bloecke.push(cur);
          cur = null;
        }
      }
      if (cur) bloecke.push(cur);

      const gesehen = new Set<string>();
      for (const b of bloecke) {
        if (b.length < 2) continue;
        const k = b.join("\n");
        if (gesehen.has(k)) fund.push(`${f}: ${b[0]}`);
        gesehen.add(k);
      }
    }
    expect(fund).toEqual([]);
  });

  it("endet nicht mit einem Kommentar ohne Code", () => {
    const fund: string[] = [];
    for (const f of MODULE) {
      const zeilen = lies(f);
      let i = zeilen.length - 1;
      while (i >= 0 && leer(zeilen[i])) i--;
      if (i >= 0 && istKommentar(zeilen[i] ?? "")) {
        let von = i;
        while (von > 0 && istKommentar(zeilen[von - 1] ?? "")) von--;
        fund.push(`${f}: ${(zeilen[von] ?? "").trim().slice(0, 60)}`);
      }
    }
    expect(fund).toEqual([]);
  });

  it("trennt die Importe mit einer Leerzeile vom Code", () => {
    const fund: string[] = [];
    for (const f of MODULE) {
      const zeilen = lies(f);
      let letzterImport = -1;
      for (let i = 0; i < zeilen.length; i++) if (istImport(zeilen[i] ?? "")) letzterImport = i;
      if (letzterImport < 0) continue;
      const danach = zeilen[letzterImport + 1];
      if (!leer(danach)) fund.push(`${f}:${letzterImport + 2}`);
    }
    expect(fund).toEqual([]);
  });
});
