// Das Markdown der importierten Referenzen (design.md, Guidelines, Komponenten).
//
// Der Renderer deckt genau ab, was diese Dateien nutzen: Ueberschriften, Tabellen,
// Listen, Blockzitate, Code, Hervorhebungen und Links. Rohes HTML wird immer
// maskiert; es gibt keinen Durchgriff auf das Dokument.
//
// Das Modul haengt an nichts: kein DOM, kein Zustand, keine API. Deshalb steht es
// fuer sich - der Rest von `app-references.js` baut Fenster und Listen, dieses
// Modul macht aus Text Markup.

/* Dokumente der importierten Referenzen (design.md, Guidelines, Komponenten).
   Der Renderer deckt genau ab, was diese Dateien nutzen: Ueberschriften,
   Tabellen, Listen, Blockzitate, Code, Hervorhebungen und Links. Rohes HTML
   wird immer maskiert, es gibt keinen Durchgriff auf das Dokument. */
export function refsEscapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function refsInlineMarkdown(value) {
  return String(value)
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${refsEscapeHtml(part.slice(1, -1))}</code>`;
      }
      return refsEscapeHtml(part)
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
        .replace(
          /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
          '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
        );
    })
    .join("");
}

export function refsMarkdownTable(rows) {
  const cells = (row) =>
    String(row)
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  const head = cells(rows[0] ?? "")
    .map((cell) => `<th>${refsInlineMarkdown(cell)}</th>`)
    .join("");
  const body = rows
    .slice(2)
    .map(
      (row) =>
        `<tr>${cells(row)
          .map((cell) => `<td>${refsInlineMarkdown(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function refsRenderMarkdown(source) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let listKind = null;
  let codeLines = null;

  const closeList = () => {
    if (listKind !== null) {
      out.push(`</${listKind}>`);
      listKind = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${refsInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    closeList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (codeLines !== null) {
      if (trimmed.startsWith("```")) {
        out.push(`<pre><code>${refsEscapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }
      continue;
    }
    if (trimmed.startsWith("```")) {
      flushAll();
      codeLines = [];
      continue;
    }
    if (trimmed === "") {
      flushAll();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading !== null) {
      flushAll();
      const level = (heading[1] ?? "#").length;
      out.push(`<h${level}>${refsInlineMarkdown(heading[2] ?? "")}</h${level}>`);
      continue;
    }

    const next = (lines[index + 1] ?? "").trim();
    if (trimmed.startsWith("|") && next.startsWith("|") && /^\|?[\s:|-]+\|/.test(next)) {
      flushAll();
      const table = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith("|")) {
        table.push((lines[index] ?? "").trim());
        index += 1;
      }
      index -= 1;
      out.push(refsMarkdownTable(table));
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.+)$/.exec(trimmed);
    if (bullet !== null || ordered !== null) {
      flushParagraph();
      const kind = ordered === null ? "ul" : "ol";
      if (listKind !== kind) {
        closeList();
        out.push(`<${kind}>`);
        listKind = kind;
      }
      out.push(`<li>${refsInlineMarkdown((bullet ?? ordered)[1] ?? "")}</li>`);
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushAll();
      out.push(`<blockquote>${refsInlineMarkdown(trimmed.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    paragraph.push(trimmed);
  }
  if (codeLines !== null) {
    out.push(`<pre><code>${refsEscapeHtml(codeLines.join("\n"))}</code></pre>`);
  }
  flushAll();
  return out.join("");
}
