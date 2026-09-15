# JSON-first Bau-Modell: Sektionen + Registry, kein Codegen

Status: accepted · 14.09.2026

Agenten und Menschen sollen dieselben Websites bauen können — ohne fragile Code-Generierung und ohne proprietäres Format. **Entscheidung:** Eine Website ist strukturiertes JSON (flacher NodeTree aus Sektionen einer Registry). Editor, MCP-Tools und Agenten schreiben ausschließlich über kanonische Mutationen; gerendert wird über React-/Astro-Komponenten aus der Registry. Es wird **kein Code pro Site generiert**.

**Betrachtete Optionen:**
- *AI-generierter Code pro Site* (v0-/Lovable-Muster) — frei, aber Design-Konsistenz, visuelle Editierbarkeit, Approval und Wartbarkeit brechen bei Skalierung.
- *Proprietäres visuelles Format* (Framer-/Webflow-Muster) — starke Editor-UX, aber Agenten können es nicht programmatisch lesen/schreiben; Vendor-Lock-in.
- *Freier Baum ohne Registry-Regeln* — flexibel, aber maximale Inkonsistenz-Gefahr bei Agenten-Output.

**Konsequenzen:**
- Visueller Editor, Approval-Queue und verlässliche Motion-Qualität (Presets) sind nur möglich, weil Edits strukturierte, diffbare Daten sind.
- Alle Fähigkeiten und Grenzen hängen am Section-Katalog: Neue Layouts entstehen durch neue Sections, nicht durch freien Code.
- Eine spätere Eskalationsstufe (echter Custom-Code) müsste bewusst als Modell-Erweiterung eingeführt werden — nicht als Hintertür.
- Referenz: `.scratch/senify-v1/artifacts/01-datenmodell.md` (kanonisches Datenmodell).
