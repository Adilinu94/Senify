# Editor v2 - Agent-Style-Gate als Tests (B12)

Status: offen — **Namenskorrektur 18.09. (O13/ADR-0005)**
Abhaengig von: 07-style-rule-modell (`authoredBy` als Datum), 13-bridge-style-rules (Persistenzpfad)
Entscheidungen: O13/ADR-0005 — dieses Ticket **ist** die Wert-Ebene-Fence
Muss liegen: Mit Ticket 02 Punkt 7 (MCP-Style-Tools), nicht danach
Herkunft: `.scratch/editor-v2-rebuild/research/02-bauplan-aenderungen.md`, B12

## Namenskorrektur: `origin` heisst hier `authoredBy`

Dieses Ticket sprach durchgehend von `origin: "agent"`. Das kollidiert mit dem kanonischen Modell
(`widget-engine/src/css/style-rule.ts`), in dem `origin` die **Import-Herkunft** ist
(`{ source: "styles/main.css", ordinal: 3 }`) und als Identitaet fuer den Re-Import dient. Zwei
Bedeutungen unter einem Feldnamen waeren ein Datenmodellfehler.

**Ab jetzt gilt:** die Autor-Herkunft ist ein **eigenes** Feld
`authoredBy: "user" | "agent" | "preset"` (Standard `"user"`), ergaenzt in Ticket 07 am kanonischen
Modell. `origin` bleibt unangetastet die Import-Herkunft. Ueberall unten ist `origin: "agent"` als
`authoredBy: "agent"` zu lesen.

## Verhaeltnis zu ADR-0005 (offenes CSS)

ADR-0005 oeffnet die **Property-Ebene** fuer Menschen. Dieses Ticket ist die **Wert-Ebene** fuer
Agenten — beides gilt gleichzeitig und widerspricht sich nicht:

| Ebene | Mensch (`authoredBy: "user"`) | Agent (`authoredBy: "agent"`) |
|---|---|---|
| Welche Property | frei (ADR-0005) | frei (ADR-0005) |
| Welche Wert-Form | Wert-Grammatik (ADR-0005) | Wert-Grammatik **plus** Token-Zwang (Punkt 1) |
| Roh-Hex `#ff00aa` | erlaubt | abgelehnt, wenn ein Token passt |
| `rawCss` / freier Selektor | erlaubt | nur im Rahmen von Punkt 3 |

Die Fence lebt damit **im Schreibpfad des Stores, abhaengig von `authoredBy`** — nicht im Compiler
und nicht in der Wert-Grammatik. Das ist die in ADR-0005 („Folgen") verortete Stelle.

## Ziel

Ticket 02 Punkt 7 verspricht: „Guardrails bleiben (registrierte Widgets + Schema + Tokens,
kein freier CSS-Code vom Agenten)". Das ist heute eine Absicht, kein Test. Die Guardrail-
Absicht wird als harte Regeln im Schreibpfad formuliert — als Tests, die rot schlagen, wenn
jemand sie abschwächt. Die Ablehnungen laufen über die bestehende SenifyError-Kette
(category validation, dotted field path); der Mechanismus existiert, es fehlt die feste
Regelliste als Tests.

## Umfang

1. **Token-Zwang für Agenten:** eine Mutation mit `origin: "agent"`, die einen Roh-Hexwert
   setzt, während ein passendes Theme-Token existiert, wird abgelehnt
   (`color: "#ff00aa"` -> Fehler mit Vorschlag `{ $token: accent }`). Der Resolver
   (`themeTokenResolver`) liefert die Kandidaten; die Regel lehnt nur ab, wenn ein
   Kandidat existiert — Freiwerte bleiben erlaubt, wo kein Token passt (kein Knebel).
2. **origin-Integrität:** `upsertStyleRule` mit `origin: "agent"` ist nur über den
   MCP-/Mutations-Pfad des Agenten erreichbar; ein Umbau einer user-Regel durch einen
   Agent-Batch erzeugt KEINE agent-Regel (origin bleibt erhalten, Änderung wird als
   user-Kontext protokolliert). `reorderStyleRule` auf fremd-origin-Regeln: erlaubt,
   aber audit-markiert.
3. **Scoped-Custom-CSS-Grenzen** (Ticket 02 Punkt 3 „Custom CSS pro Widget"):
   Länge begrenzt (Vorschlag 2.000 Zeichen), kein `@import`, keine `url()`-Fremdhost-Referenzen,
   Selektor darf nur den eigenen Knoten-Anker referenzieren — als Validierung in der
   Operation, getestet mit je einem Ablehnungs- und einem Durchlassfall.
4. **Fehlerform:** alle Ablehnungen SenifyError, category „validation", field-Pfad zur
   Regel/Eigenschaft, suggestion mit dem legalen Alternative-Text (Token-Vorschlag) —
   so kann der Agent selbst nachjustieren.
5. **Tests als Gate:** die Regelliste lebt als Testdatei (z. B.
   `packages/engine/test/mutations/agent-style-gate.test.ts`), die JEDE Regel mit
   Ablehnung und Durchflussfall zeigt — Abschwächungen werden sichtbar rot.

## Bewusst NICHT

- Keine Produkt-Blockade für menschliche `origin: "user"`-Werte (Freiheit im Editor bleibt).
- Kein Prompt-/Skill-Bezug — das Gate ist serverseitig, agentenunabhängig.

## Abnahme

- Testdatei zeigt je Regel: Ablehnungsfall (mit erwartetem field/suggestion) und
  Durchlassfall.
- Ein Agent-Batch mit Roh-Hex bei vorhandenem Token schlaegt fehl, OHNE dass etwas
  geschrieben wird (Transaktionsgarantie aus dem Store/Batch-Pfad bleibt intakt).
- `pnpm test`, `pnpm typecheck`, `pnpm lint` gruen.

## Nachtrag 19.09. (Befund + Scheiben-Plan aus Welle 1)

Die Audit-Luecke aus dem Verbesserungsplan (E3) beruehrt dieses Ticket: `author` ist ein freies
Body-Feld (`contract.ts:375-383`) und wird ungeprueft auditiert — Identitaetsfaelschung moeglich.
Befund der Planung: Die Author-Nutzung zieht sich durch **25+ Stellen** in `http.ts`
(`parsed.author`/`input.author` an Store/Audit/Events); eine zentrale Body-Parse-Stelle mit
Auth-Zugriff gibt es nicht (`readJsonBody` kennt die Auth nicht).

**Scheiben-Plan (naechste Session, in dieser Reihenfolge):**

1. **Author-Resolver (Scheibe 1):** `AuthInfo` in den Route-Kontext reichen; Helper
   `resolveAuthor(auth, body)` — Identitaet (`id`/`label`) **immer** aus `auth.tokenName`;
   `kind` aus dem Token (neues additives Token-Feld `kind: "human" | "agent"`: Programm-Token
   human, `senify setup` agent, `tokens create --kind`); alle `author:`-Stellen umstellen.
   Test: ein direkter API-Call kann keine fremde Identitaet auditieren.
2. **Idempotency-Keys (Scheibe 2):** `create_page`, `create_entry`, `upload_asset`,
   `create_reference_collection` mit optionalem Key (Unique-Constraint; Retry liefert die
   gleiche Antwort statt eines Duplikats).
3. **Fence (Scheibe 3, Kern dieses Tickets):** `authoredBy`-Pflicht im Style-Schreibpfad —
   Agenten nur Token-Referenzen (`$token`), `ambient`/`rawCss` nur `user`; Regelliste als Tests
   (wie oben unter Abnahme beschrieben).
