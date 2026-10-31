import { describe, expect, it } from "vitest";
import { buildSubmissionsCsv } from "@senify/engine";

// Die CSV-Regeln ohne Engine: Spalten und Zeilen hinein, Text heraus. Geprueft
// werden die vier Regeln, die eine Tabellenkalkulation brechen koennen -
// Trenner, Anfuehrungszeichen, Zeilenumbruch und ein Formelanfang.

function stripBom(text: string): string {
  return text.startsWith("\uFEFF") ? text.slice(1) : text;
}

describe("submissions CSV", () => {
  it("neutralizes every spreadsheet formula trigger, including tab and carriage return", () => {
    const row = (value: string) => ({
      entryId: "e",
      slug: "s",
      status: "published" as const,
      createdAt: "2026-09-29T00:00:00.000Z",
      submittedAt: null,
      sourcePath: null,
      values: [{ key: "a", label: "Wert", value }],
    });
    const triggers = ["=1+1", "+1", "-1", "@SUM(1)", "\t=1+1", "\r=1+1", "\r\n=1+1"];
    const csv = buildSubmissionsCsv({
      columns: [{ key: "a", label: "Wert" }],
      rows: [...triggers, "normal", "a=b"].map(row),
    });
    const body = stripBom(csv).slice("Wert\r\n".length);
    for (const trigger of triggers) {
      // The guard puts an apostrophe in front; a cell with a line break is quoted as a whole.
      const guarded = `'${trigger}`;
      expect(body, JSON.stringify(trigger)).toContain(
        /[\r\n]/.test(guarded) ? `"${guarded}"` : guarded,
      );
    }
    expect(body).toContain("\r\nnormal\r\n");
    expect(body).toContain("\r\na=b\r\n");
  });

  it("quotes semicolons, quotes and newlines per RFC 4180, plain umlauts stay bare", () => {
    const columns = [
      { key: "name", label: "Name" },
      { key: "notiz", label: "Notiz" },
    ];
    const row = {
      entryId: "e1",
      slug: "eins",
      status: "published" as const,
      createdAt: "2026-09-15T10:00",
      submittedAt: "2026-09-15T10:00",
      sourcePath: "/",
      values: [
        { key: "name", label: "Name", value: "Anna;Beispiel" },
        { key: "notiz", label: "Notiz", value: 'Rückruf "bitte"\nzweite Zeile' },
      ],
    };
    const csv = buildSubmissionsCsv({ columns, rows: [row] });
    expect(csv).toBe(
      '\uFEFFName;Notiz\r\n"Anna;Beispiel";"Rückruf ""bitte""\nzweite Zeile"\r\n',
    );

    // Plain values stay unquoted; a leading formula character is neutralized.
    const plain = buildSubmissionsCsv({
      columns,
      rows: [
        {
          ...row,
          values: [
            { key: "name", label: "Name", value: "Grüße" },
            { key: "notiz", label: "Notiz", value: "=SUM(A1)" },
          ],
        },
      ],
    });
    expect(plain).toBe("\uFEFFName;Notiz\r\nGrüße;'=SUM(A1)\r\n");
  });
});
