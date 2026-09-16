import type { SectionDoc, ToolDoc } from "./catalog.ts";
import { errorCatalog, sectionCatalog, toolCatalog } from "./catalog.ts";

export type SkillReferenceFile = {
  name: string;
  content: string;
};

function propSummary(section: SectionDoc): string {
  return section.props
    .map((prop) => {
      const options =
        prop.options !== undefined && prop.options.length > 0
          ? `: ${prop.options.join("|")}`
          : "";
      return `\`${prop.key}\` (${prop.control}${options})`;
    })
    .join(", ");
}

function sectionsMarkdown(sections: SectionDoc[]): string {
  const lines: string[] = [
    "# Sektions-Katalog (generiert)",
    "",
    "Alle registrierten Sektionen mit Kern-Props. Varianten sind Presets; das vollständige Schema, die Style-Props (Innenteile) und das Golden Example liefert `get_section` (MCP) — oder die Referenz-Seite `/reference/sections/<typ>`.",
    "",
  ];
  const categories = [...new Set(sections.map((section) => section.category))];
  for (const category of categories) {
    lines.push(`## ${category}`, "");
    for (const section of sections.filter((entry) => entry.category === category)) {
      lines.push(`- **${section.type}** — ${section.title}: ${propSummary(section)}`);
      if (section.variants.length > 0) {
        lines.push(
          `  Varianten: ${section.variants.map((variant) => `\`${variant.name}\``).join(", ")}`,
        );
      }
      if (section.motionPresets.length > 0) {
        lines.push(
          `  Motion: ${section.motionPresets.map((preset) => `\`${preset}\``).join(", ")}`,
        );
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function errorsMarkdown(): string {
  const lines: string[] = [
    "# Fehlerkategorien (generiert)",
    "",
    "Jede Engine-Antwort trägt `{ error: { category, message, opIndex?, field?, suggestion? } }`. Der Vorschlag ist eine Handlungsanweisung — befolge ihn, statt zu raten.",
    "",
  ];
  for (const error of errorCatalog()) {
    lines.push(`- **${error.category}** — ${error.summary}`);
    lines.push(`  Beispiel: ${error.example.message}`);
    lines.push(`  Vorschlag: ${error.example.suggestion}`);
  }
  return `${lines.join("\n")}\n`;
}

function toolsMarkdown(tools: ToolDoc[]): string {
  const lines: string[] = [
    "# Tool-Katalog (generiert)",
    "",
    "Scopes werden serverseitig durchgesetzt; Schreiben läuft über Drafts (`apply_mutations`).",
    "",
  ];
  for (const scope of ["read", "write", "publish"] as const) {
    const scoped = tools.filter((tool) => tool.scope === scope);
    lines.push(`## ${scope} (${scoped.length})`, "");
    for (const tool of scoped) {
      const parameters =
        tool.parameters.length === 0
          ? "keine"
          : tool.parameters
              .map(
                (parameter) =>
                  `\`${parameter.name}\`${parameter.required ? " (required)" : ""}`,
              )
              .join(", ");
      lines.push(`- **${tool.name}** — ${tool.title}: ${tool.description}`);
      lines.push(`  Parameter: ${parameters}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

// The generated part of the skill pack: same sources as the portal (registry,
// tool catalog, error catalog), compact for agent context. `senify setup`
// refreshes these files on every run.
export function skillReferenceFiles(): SkillReferenceFile[] {
  return [
    { name: "sections.md", content: sectionsMarkdown(sectionCatalog()) },
    { name: "errors.md", content: errorsMarkdown() },
    { name: "tools.md", content: toolsMarkdown(toolCatalog()) },
  ];
}
