import type { SectionCategory } from "@senify/section-sdk";
import type { ErrorDoc, SectionDoc, ToolDoc } from "./catalog.ts";
import { errorCatalog, sectionCatalog, toolCatalog } from "./catalog.ts";
import type { DocsPage } from "./model.ts";

const CATEGORY_LABELS: Record<SectionCategory, string> = {
  structure: "Struktur",
  content: "Inhalt",
  commerce: "Conversion",
  media: "Medien",
  utility: "Utility",
};

const CATEGORY_ORDER: SectionCategory[] = [
  "structure",
  "content",
  "commerce",
  "media",
  "utility",
];

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");
}

function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const divider = `| ${headers.map(() => "---").join(" | ")} |`;
  return [head, divider, ...rows.map((row) => `| ${row.join(" | ")} |`)].join(
    "\n",
  );
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.]+\./);
  const sentence = match ? match[0] : text;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}...` : sentence;
}

function codeList(values: string[]): string {
  return values.length === 0
    ? "keine"
    : values.map((value) => `\`${value}\``).join(", ");
}

function page(
  path: string,
  title: string,
  description: string,
  order: number,
  body: string,
): DocsPage {
  return {
    path,
    title,
    description,
    group: "Reference",
    order,
    body: body.trimEnd(),
  };
}

function toolsPage(tools: ToolDoc[]): DocsPage {
  const bodies: string[] = [
    "Der komplette MCP-Tool-Katalog. Scopes werden serverseitig am Token durchgesetzt; jeder Aufruf landet im Audit-Log.",
    table(
      ["Scope", "Deckt ab", "Beispiel-Tools"],
      [
        ["`read`", "Kontext lesen", "`whoami`, `get_page`, `list_sections`"],
        [
          "`write`",
          "Drafts erstellen und ändern (drafts-first)",
          "`apply_mutations`, `create_page`, `update_theme`",
        ],
        [
          "`publish`",
          "Live schalten, zurücknehmen, löschen",
          "`publish_release`, `rollback_release`, `delete_page`",
        ],
      ],
    ),
  ];
  const scopes: ToolDoc["scope"][] = ["read", "write", "publish"];
  for (const scope of scopes) {
    const items = tools.filter((tool) => tool.scope === scope);
    bodies.push(`## Tools — \`${scope}\` (${items.length})`);
    for (const tool of items) {
      const parameters =
        tool.parameters.length === 0
          ? "keine"
          : tool.parameters
              .map(
                (parameter) =>
                  `\`${parameter.name}\` (${parameter.type}${parameter.required ? ", required" : ""})`,
              )
              .join(", ");
      bodies.push(`### \`${tool.name}\` — ${tool.title}`);
      bodies.push(tool.description);
      bodies.push(`**Parameter:** ${parameters}`);
    }
  }
  bodies.push("## `apply_mutations` — Vertrag");
  bodies.push(
    [
      "- Der Body enthält `pageId`, `baseDraftVersion` und `mutations[]`.",
      "- Der Batch ist atomar: Entweder alle Mutationen greifen oder keine.",
      "- `dry_run: true` validiert inklusive Guardrails ohne zu schreiben.",
      "- Auf Erfolg: `newDraftVersion`, `undoBatchId`, `warnings[]`.",
      "- Konflikt: `conflict`-Fehler — Seite neu laden und mit aktueller `baseDraftVersion` wiederholen.",
    ].join("\n"),
  );
  bodies.push("## Fehlerformat");
  bodies.push(
    [
      "```json",
      "{",
      '  "error": {',
      '    "category": "validation | guardrail | conflict | auth | not_found",',
      '    "message": "Unknown prop \\"headlin\\" for section \\"hero\\"",',
      '    "opIndex": 1,',
      '    "field": "headline",',
      '    "suggestion": "Allowed props: eyebrow, headline, sub, ctas"',
      "  }",
      "}",
      "```",
    ].join("\n"),
  );
  return page(
    "/reference/tools",
    "Tools",
    `Der MCP-Tool-Katalog mit ${tools.length} Tools: Scopes, Parameter, apply_mutations-Vertrag und Fehlerformat.`,
    1,
    bodies.join("\n\n"),
  );
}

function sectionsIndexPage(sections: SectionDoc[]): DocsPage {
  const bodies: string[] = [
    `Alle ${sections.length} registrierten Sektionen des Katalogs — generiert aus der Registry. Jede Sektion hat eine Detailseite mit Props, Varianten, Slots und Golden Example.`,
  ];
  for (const category of CATEGORY_ORDER) {
    const items = sections.filter((section) => section.category === category);
    if (items.length === 0) continue;
    bodies.push(`## ${CATEGORY_LABELS[category]} (${items.length})`);
    bodies.push(
      table(
        ["Sektion", "Zweck", "Varianten", "Motion-Presets"],
        items.map((section) => [
          `[${section.title}](/reference/sections/${section.type})`,
          cell(firstSentence(section.description)),
          codeList(section.variants.map((variant) => variant.name)),
          codeList(section.motionPresets),
        ]),
      ),
    );
  }
  return page(
    "/reference/sections",
    "Sektions-Katalog",
    `${sections.length} Sektionen mit Props, Varianten, Slots und Golden Examples — generiert aus der Registry.`,
    2,
    bodies.join("\n\n"),
  );
}

function propsTable(props: SectionDoc["props"]): string {
  return table(
    ["Prop", "Label", "Control", "Hinweise"],
    props.map((prop) => {
      const hints: string[] = [];
      if (prop.options !== undefined && prop.options.length > 0) {
        hints.push(`Optionen: ${codeList(prop.options)}`);
      }
      if (prop.tokenGroup !== undefined) {
        hints.push(`Token-Gruppe: \`${prop.tokenGroup}\``);
      }
      if (prop.part !== undefined) hints.push(`Part: \`${prop.part}\``);
      if (prop.group !== undefined) hints.push(`Gruppe: ${prop.group}`);
      return [
        `\`${prop.key}\``,
        cell(prop.label),
        `\`${prop.control}\``,
        hints.map(cell).join(" · ") || "—",
      ];
    }),
  );
}

function sectionPage(section: SectionDoc): DocsPage {
  const bodies: string[] = [
    section.description,
    `**Kategorie:** ${CATEGORY_LABELS[section.category]} · **Version:** ${section.version}`,
    "## Props",
    propsTable(section.props),
  ];
  if (section.styleProps.length > 0) {
    bodies.push("## Style-Props");
    bodies.push(
      'Style-Werte sind Token-Referenzen (`{ "$token": "accent" }`) oder freie Werte; Token-Gruppen nennen die erlaubte Familie.',
    );
    bodies.push(propsTable(section.styleProps));
  }
  bodies.push("## Varianten");
  bodies.push(
    section.variants.length === 0
      ? "keine"
      : section.variants
          .map((variant) => `- \`${variant.name}\` — ${variant.label}`)
          .join("\n"),
  );
  if (section.slots.length > 0) {
    bodies.push("## Slots");
    bodies.push(
      section.slots
        .map(
          (slot) =>
            `- \`${slot.name}\` — erlaubt: ${codeList(slot.allowedTypes)}${slot.max === undefined ? "" : `, max ${slot.max}`}`,
        )
        .join("\n"),
    );
  }
  bodies.push("## Erlaubte Kinder");
  bodies.push(
    section.allowedChildren.length === 0
      ? "keine"
      : codeList(section.allowedChildren),
  );
  bodies.push("## Motion-Presets");
  bodies.push(codeList(section.motionPresets));
  bodies.push("## Golden Example");
  bodies.push(["```json", section.golden, "```"].join("\n"));
  return page(
    `/reference/sections/${section.type}`,
    section.title,
    firstSentence(section.description),
    10,
    bodies.join("\n\n"),
  );
}

function errorsPage(errors: ErrorDoc[]): DocsPage {
  const bodies: string[] = [
    "Alle Engine-Fehler folgen einem strukturierten Format — als Handlungsanweisung für Agenten: Kategorie, Fundstelle, Vorschlag.",
    [
      "```json",
      "{",
      '  "error": {',
      '    "category": "validation | guardrail | conflict | auth | not_found",',
      '    "message": "…",',
      '    "opIndex": 1,',
      '    "field": "motion.preset",',
      '    "suggestion": "…"',
      "  }",
      "}",
      "```",
    ].join("\n"),
  ];
  for (const error of errors) {
    bodies.push(`## ${error.title} — \`${error.category}\``);
    bodies.push(error.summary);
    bodies.push(`**Beispiel:** \`${error.example.message}\``);
    bodies.push(`**Vorschlag:** ${error.example.suggestion}`);
  }
  return page(
    "/reference/errors",
    "Fehlercodes",
    "Die fünf Fehlerkategorien der Engine mit Beispielen und Vorschlägen.",
    100,
    bodies.join("\n\n"),
  );
}

// The generated reference set: tools, section catalog (index + one page per
// section) and error categories.
export function referencePages(): DocsPage[] {
  const sections = sectionCatalog();
  return [
    toolsPage(toolCatalog()),
    sectionsIndexPage(sections),
    ...sections.map(sectionPage),
    errorsPage(errorCatalog()),
  ];
}
