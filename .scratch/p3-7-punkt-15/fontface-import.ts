// Befund zu P3-7 Punkt 15: Wo verliert der Import die F37-Blanka-Faces?
// Liest die IR-Fonts, den Asset-Report und den Theme-Patch eines echten
// Browser-Imports und vergleicht sie mit den Faces des Bakes.
import { runImport } from "../../packages/framer-import/src/index.ts";
import { fontFilesOf } from "@senify/engine";

const uploader = async ({ filename }: { filename: string; mime: string; data: Buffer; alt: string | null }) => ({
  assetId: "x",
  url: `/assets/x/${filename}`,
  deduped: false,
});

const run = await runImport({ source: { kind: "url", url: "https://unifiersofjapan.framer.website/" }, mode: "fidelity", uploader });

const irFonts = run.document.styles.fonts;
console.log(`IR-Fonts: ${irFonts.length}`);
const byFamily = new Map<string, number>();
for (const face of irFonts) byFamily.set(face.family, (byFamily.get(face.family) ?? 0) + 1);
for (const [family, count] of byFamily) console.log(`  ${family} · ${count}`);

const reportFonts = run.assets?.fonts ?? [];
console.log(`\nAsset-Report-Fonts: ${reportFonts.length}`);
const repByFamily = new Map<string, { faces: number; files: number }>();
for (const face of reportFonts) {
  const entry = repByFamily.get(face.family) ?? { faces: 0, files: 0 };
  entry.faces += 1;
  entry.files += face.files.length;
  repByFamily.set(face.family, entry);
}
for (const [family, entry] of repByFamily) console.log(`  ${family} · ${entry.faces} Faces / ${entry.files} Dateien`);

const blocked = (run.document.findings ?? []).filter((finding) => finding.kind === "asset-blocked");
console.log(`\nasset-blocked: ${blocked.length}`);
for (const finding of blocked.slice(0, 20)) console.log(`  ${finding.message} · ${finding.evidence}`);

const patch = fontFilesOf(run.mapped.themePatch, reportFonts);
type Role = { family: string; weights?: number[]; files?: Record<string, string> };
const fonts = patch.fonts as unknown as { body?: Role; display?: Role; extra?: Record<string, Role> } | undefined;
console.log(`\nTheme-Patch-Fonts (mit Dateien):`);
for (const slot of ["body", "display"] as const) {
  const role = fonts?.[slot];
  if (role === undefined) continue;
  console.log(`  ${slot}: ${role.family} · files ${role.files === undefined ? "keine" : Object.keys(role.files).join(",")}`);
}
for (const [key, role] of Object.entries(fonts?.extra ?? {})) {
  console.log(`  extra.${key}: ${role.family} · weights ${(role.weights ?? []).join(",")} · files ${role.files === undefined ? "keine" : Object.keys(role.files).join(",")}`);
}
