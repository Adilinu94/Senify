// Der erweiterte Canvas-Baum, gemerkt nach Dokument-Identitaet.
//
// Warum das hier liegt und nicht in `canvas/adapter.ts`: der Schreibpfad
// (`state/patches.ts`) muss den Cache verwerfen, und `state -> canvas -> state`
// waere ein Paket-Zyklus, den `pnpm deps:check` zu Recht ablehnt. Die
// Abhaengigkeit zeigt deshalb in eine Richtung: `canvas` liest `state`.
//
// Warum es den Cache ueberhaupt gibt: `canvas.refresh()` laeuft bei JEDEM
// Store-Ereignis, auch bei einer reinen Auswahl, bei der sich das Dokument
// nicht aendert. Der Aufbau kostete an einem echten Import (1 694 Knoten)
// 9,6 ms. Der Renderer hatte zwar einen eigenen `cachedTree`-Waechter, der
// konnte aber nie greifen, weil er jedes Mal ein neues Objekt bekam - also
// wurde der ganze React-Baum fuer einen Klick neu gerendert, der nur den
// Selektionsring bewegt.
//
// Die Identitaet ist als Schluessel korrekt, weil der Store bei jedem Schreiben
// ein neues Dokument einsetzt. `applyDocumentPatches` arbeitet dagegen
// IN-PLACE auf seiner Arbeitskopie (ein `structuredClone`, dann Patch fuer
// Patch), deshalb verwirft der Schreibpfad den Cache nach jedem Patch - siehe
// `invalidateCanvasTreeCache` in `state/patches.ts`.

import type { NodeTree } from "@senify/section-sdk";
import type { EditorDocument } from "./document.ts";

export type ExpandedCanvasTree = {
  tree: NodeTree;
  copies: Map<string, string[]>;
  origins: Map<string, { instanceId: string; partId: string }>;
};

let cache: { document: EditorDocument; expanded: ExpandedCanvasTree } | null = null;

export function cachedCanvasTree(document: EditorDocument): ExpandedCanvasTree | undefined {
  return cache !== null && cache.document === document ? cache.expanded : undefined;
}

export function rememberCanvasTree(
  document: EditorDocument,
  expanded: ExpandedCanvasTree,
): void {
  cache = { document, expanded };
}

export function invalidateCanvasTreeCache(): void {
  cache = null;
}
