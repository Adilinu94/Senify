import type { SubmissionColumn } from "./forms.ts";
import type { SubmissionRow } from "./types.ts";

// The CSV of the submissions view: one pure function from columns and rows to
// text - semicolon-separated (the German spreadsheet default), quoted per
// RFC 4180 and led by a BOM so Excel keeps the Umlaute. The rules live here,
// not in the form domain: the view decides WHICH columns, this file decides how
// a cell survives a spreadsheet, and both halves are checked on their own.

const CSV_DELIMITER = ";";

function csvCell(value: string): string {
  // A leading =+-@ - or a tab or carriage return, which Excel skips before it
  // reads the formula - would be run as a formula: neutralize it.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (guarded.includes(CSV_DELIMITER) || /["\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function buildSubmissionsCsv(view: {
  columns: SubmissionColumn[];
  rows: SubmissionRow[];
}): string {
  const lines = [
    view.columns.map((column) => csvCell(column.label)).join(CSV_DELIMITER),
  ];
  for (const row of view.rows) {
    lines.push(
      row.values.map((value) => csvCell(value.value)).join(CSV_DELIMITER),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
