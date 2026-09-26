# Kein MCP-Sampling: Der Server fragt kein LLM, der Agent bringt sein Modell mit

Status: accepted · 23.09.2026
Bezug: Verbesserungsplan E4 Scheibe 2 („Sampling bewusst nicht nutzen"), E12
(Capture-Kette), E25 (Brief als Maschinenvertrag).

Der MCP-Server könnte per `sampling/createMessage` das Modell des Clients
anzapfen (z. B. für die Referenz-Klassifikation oder Design-Vorschläge). Er tut
es nicht: Weder `server.ts` noch ein Tool ruft je `createMessage` auf, kein
Client braucht die `sampling`-Capability (verifiziert per Code-Suche über
`packages/`: null Treffer für `sampling/createMessage`). Die Klassifikation
einer Referenz entsteht aus deterministischer Extraktion (Belegstellen,
Häufigkeiten) plus dem Urteil des angebundenen Agenten — der sein Modell
ohnehin mitbringt.

**Entscheidung:** Senify nutzt MCP-Sampling nicht. KI-Urteile fallen auf zwei
Ebenen, beide außerhalb des Servers: (1) der Agent (sein Modell, seine
Konfiguration, sein Kostenstellen-Bewusstsein) über Tools, Prompts und
Resources; (2) deterministische Engine-Auswertung (Extraktion, Scores,
Heuristiken S1–S12, Diffs) ohne Modellaufruf. Der Server bleibt ein
modell-loser, auditierbarer Ausführungsvertrag: gleiche Eingabe, gleiche
Antwort, kein Token-Verbrauch, keine Modell-Latenz, keine fremden
API-Schlüssel in der Engine.

**Betrachtete Optionen:**
- *Sampling für Klassifikation/Vorschläge* — verworfen: Der Server bekäme eine
  Modell-Abhängigkeit (Latenz, Kosten, Verfügbarkeit, Reproduzierbarkeit
  dahin); jede Antwort hinge vom Client-Modell ab — Tests würden Flakiness
  erben. Die deterministische Extraktion trägt die Fakten bereits.
- *Sampling nur als Fallback* — verworfen: Ein Fallback, der nie testbar
  denselben Vertrag erfüllt, ist kein Fallback, sondern ein zweites System.
- *Eigene KI-Anbindung in der Engine (API-Key, Modell-Call)* — verworfen:
  Betreiber-Modell (BYOK liegt beim Agenten bzw. beim Image-Provider), kein
  Schlüssel-Management, keine Abrechnung, kein Latenz-Risiko im Schreibpfad.
  Ausnahme bleibt die Bildgenerierung (ADR-0008): Dort ist das Modell das
  Werkzeug, nicht der Entscheider — und die Kette läuft über explizite
  Provider mit Quota und Fallback, nicht über Sampling.
- *Status quo festschreiben (diese ADR)* — gewählt: dokumentiert die
  Nicht-Nutzung als bewusste Architektur-Eigenschaft statt als Lücke.

**Konsequenzen:**
- `createMcpServer` deklariert keine Sampling-Fähigkeit; Clients müssen nichts
  bereitstellen. Elicitation (Formulare) bleibt der einzige Rückkanal zum
  Menschen — Eingaben, keine Modell-Urteile.
- Wer „KI" in Senify sucht, findet sie an genau zwei Stellen: beim Agenten
  (sein Modell) und in den deterministischen Auswertungen der Engine
  (Scores, Diffs, Heuristiken). Beide sind testbar.
- Sollte je ein Modellaufruf serverseitig nötig werden (z. B. Bildmotive
  ohne Agent), läuft er über eine explizite Provider-Kette nach dem
  ADR-0008-Muster — nie über Sampling.

**Referenz:** `packages/mcp/src/server.ts` (Capabilities: tools, prompts,
resources — kein sampling), `packages/engine/src/references-extract.ts`
(deterministische Extraktion), `docs/adr/0008-lokale-bildgenerierung.md`.
