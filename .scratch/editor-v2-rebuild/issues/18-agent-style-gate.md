# Editor v2 - Agent-Style-Gate als Tests (B12)

Status: **erledigt (19.09.)** — Scheiben 1–3 umgesetzt; Regelliste als Testdatei, Ticket abgenommen
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

## Ergebnis Scheibe 1 (19.09., umgesetzt)

**Umfang:** Token-Feld `kind: "human" | "agent"` (additiv), `resolveAuthor(auth)`, alle
`author:`-Stellen umgestellt, Body-Author optional.

**Umsetzung:**

- `packages/engine/src/types.ts`: `TokenKind` + `ApiToken.kind`.
- `packages/engine/src/db.ts`: Spalte `kind` **nur additiv** per `ALTER TABLE api_tokens
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'agent'` (Haus-Konvention wie
  `style_rules_json`; Bestandsinstallationen lesen den Fail-closed-Default `agent`).
- `packages/engine/src/store.ts`: `mapToken` validiert `kind`; `createToken({ kind })` (Default
  `agent`); alle vier SELECTs tragen `kind`; `updateTokenKind` fuer die Selbstheilung.
- `packages/engine/src/auth.ts`: `TokenKindSchema`; `CreateTokenBodySchema.kind` optional.
- `packages/engine/src/http.ts`: `AuthInfo.kind` (aus `authenticate` → `record.kind`);
  `resolveAuthor(auth)` = `{ kind: auth.kind, id: auth.tokenName, label: auth.tokenName }`
  (einmal pro Batch, nicht pro Eintrag); **30** Aufrufstellen umgestellt (inkl.
  `applyMutationsToPage`/`applyEditorMutationsToPage`, die `auth` jetzt durchreichen);
  `whoami` liefert `kind`; Token-Route reicht `input.kind` durch.
- **Vertragsdateien:** alle 24 `author: AuthorSchema` → `Type.Optional(AuthorSchema)` (content,
  lifecycle, mutations, editor, references, site, templates); `createEntry`/`updateEntry` in
  `content.ts` verlangen den erzeugten Author typseitig (`& { author: Author }`).
- **CLI (`packages/mcp/src/cli.ts`):** `senify setup` sendet `kind: "agent"`;
  `senify tokens create --kind human|agent` (Default agent, mit Validierung); `tokens list`
  zeigt `kind=…`.
- **Programm (`packages/app/src/start.ts`):** Programm-Token wird mit `kind: "human"` angelegt;
  die Selbstheilung prueft `whoami.kind` und **heilt den Bestandstoken in-place** ueber
  `store.updateTokenKind` (gleiches Secret, keine zweite „Programm"-Zeile).

**Abnahme-Belege (Tests):**

- `packages/engine/test/auth.test.ts`: „accepts an explicit human kind and rejects unknown kinds"
  (201/`kind: "human"` bzw. 400/`field: "kind"`); „derives the audit kind from the token, not the
  body" (human-Token + `agent`-Body → Audit `kind: "human"`); whoami-Assertion `kind === "agent"`.
- `packages/engine/test/mutations.test.ts`: „derives the audit author from the token, never from
  the body" — gefaelschte `human`-Identitaet (`id: "chef"`) landet **nicht** im Audit (dort
  `TOKEN_AUTHOR`); ein Request **ohne** Body-Author bleibt 200 (Token traegt die Identitaet).
- `packages/app/test/server.test.ts`: „heals a pre-ticket-18 program token in place to kind
  human" — Token vor dem Start auf `agent` gesetzt, nach dem Start `kind: "human"` per whoami,
  und genau **eine** „Programm"-Zeile mit unveraenderter id (kein Neuanlegen).
- Angepasste Pflichtfeld-Tests: `theme.test.ts` (Theme-Write ohne Body-Author → 200),
  `references-library.test.ts` (Manual-Reference ohne Body-Author → 201);
  `references-library.test.ts` Provenance-Assertion auf `TOKEN_AUTHOR`.

**Zahlen:** `pnpm test` **1187 gruen / 2 uebersprungen / 132 Dateien**, typecheck 0, lint 0
(Log `.scratch/testlauf-19-09-ticket18s1.log`).

**Bekannte Grenze (Loopback-Vertrauen):** Die Token-Routen bleiben public (Bootstrap der CLI);
wer lokalen Zugriff auf die Engine hat, kann weiterhin Tokens anlegen — auch `kind: "human"`.
Das ist die bestehende Loopback-Grenze (L26/E21), kein neuer Angriffsvektor; die Fence schuetzt
gegen die *Kooperation* eines Agenten mit seinem eigenen Token, nicht gegen lokalen Root.

**Offen (Scheiben 2+3):** Idempotency-Keys; `authoredBy`-Fence im Style-Schreibpfad (Kern des
Tickets, Regelliste als Tests).

## Ergebnis Scheibe 2 (19.09., umgesetzt) — Idempotency-Keys

**Umfang:** `create_page`, `create_entry`, `upload-url`, `create_reference_collection` tragen ein
optionales Body-Feld `idempotencyKey`; ein Retry mit gleichem Key liefert die **gleiche Antwort**
statt eines Duplikats.

**Umsetzung:**

- `packages/engine/src/mutations/contract.ts`: `IdempotencyKeySchema` (String, 1–200 Zeichen);
  eingetragen in `CreatePageBodySchema`, `CreateEntryBodySchema` (`content-contract.ts`),
  `UploadUrlBodySchema` (`media.ts`), `CreateReferenceCollectionBodySchema`
  (`references-contract.ts`).
- `packages/engine/src/db.ts`: Tabelle `idempotency_keys`
  (`token_id`, `route`, `idempotency_key`, `fingerprint`, `status`, `response jsonb`,
  `created_at`; PK `(token_id, route, idempotency_key)`) + Index auf `created_at`.
  `jsonColumns` erkennt `response` (Test in `db-schema.test.ts`).
- `packages/engine/src/store.ts`: **Claim-first** — `claimIdempotencyKey` nimmt den Slot
  **vor** der Operation (zwei gleichzeitige Requests können nicht beide schreiben);
  - fertiger Eintrag + gleicher Fingerprint → `replay` (Status + Body),
  - fertig + anderer Fingerprint → `mismatch`,
  - frisch pending → `in_progress` (409),
  - pending älter als 2 min → Übernahme (abgestürzter Versuch blockiert den Key nicht),
  - TTL 24 h, Aufräumen beim Claim.
  `completeIdempotencyKey` schreibt Antwort + Status; `releaseIdempotencyKey` gibt den Slot
  nach einem Fehler frei (ein Fehlversuch verbrennt den Key nicht — korrigierter Retry
  mit gleichem Key ist erlaubt).
- `packages/engine/src/http.ts`: `withIdempotency(...)`; Fingerprint = SHA-256 über die
  kanonisierte Body-JSON (Schlüssel rekursiv sortiert, `idempotencyKey` ausgenommen), Route =
  `METHOD path` (enthält die siteId), Scope = Token + Route. Replay trägt den Header
  `idempotency-replayed: true`; `mismatch`/`in_progress` sind `conflict` mit
  `field: "idempotencyKey"` und Suggestion.
- **MCP (`packages/mcp/src/tools.ts`):** die vier Tools nehmen `idempotencyKey` als Argument
  und reichen es durch (Beschreibungen nennen den Retry-Nutzen). `idempotentHint` bleibt
  **false**: ohne Key ist ein wiederholter Aufruf nicht idempotent — die Annotation ist das
  Client-Versprechen, der Key die Server-Garantie (E3-Sprachregel).

**Tests:** `packages/engine/test/idempotency.test.ts` (12 Fälle): Replay je Route (gleiche id,
Header), anderer Key/kein Key erzeugt neu, Body-Mismatch 409, Scope je Token und Route,
Release nach Fehlversuch (korrigierter Retry 201), in-progress 409 + Übernahme eines
veralteten Claims, kanonisierte Schlüsselreihenfolge, Key-Form (leer/zu lang → 400
`field: idempotencyKey`).
`packages/mcp/test/workflow.test.ts`: `create_page` mit Key → Retry liefert dieselbe Seite,
genau eine Seite in der Liste; Schema-Feld-Assertion.

**Bekannte Grenze:** Ein Replay liefert die gespeicherte Antwort unverändert — bei
`upload-url` also die signierte URL samt ursprünglichem Ablauf. Ist sie inzwischen
abgelaufen, scheitert der PUT mit „Upload URL is expired"; dann einen frischen Key verwenden
(der Hash-Dedupe im Commit verhindert ohnehin ein doppeltes Asset).

## Ergebnis Scheibe 3 (19.09., umgesetzt) — `authoredBy`-Fence

**Umfang (Kern des Tickets):** Token-Zwang für Agenten, Provenienz-Integrität,
Scoped-Custom-CSS-Grenzen, Fehlerform, Regelliste als Tests.

**Umsetzung:**

- **Neues Modul `packages/engine/src/style-fence.ts`:** `themeColorTokens(theme)` baut den
  Rückwärtsindex der Theme-Farben (semantische Rollen der Light-Mode vor Primitiven, damit der
  Vorschlag `accent` statt `color.brand-600` heißt); `agentStyleViolations` prüft die
  Deklarations-Bags (`styles`, `states.*`, `contextStyles.*`) auf Farb-Literale **mit**
  passendem Token (Freiwerte ohne Token bleiben erlaubt — kein Knebel); `rawCssViolations`
  (Länge, `url()`-Fremdhost); `styleRuleBags` liefert die Bags mit dotted field-Pfad.
- **`store.ts`:**
  - `authoredBy` wird **aus dem Token abgeleitet** (`agent` → `"agent"`, sonst `"user"`), das
    Body-Feld ist ein ignorierter Vorschlag (nur die DB schreibt die Provenienz); **Updates
    erhalten** die bestehende Provenienz — ein Agent-Umbau einer user-Regel erzeugt **keine**
    agent-Regel (Punkt 2 wörtlich), der Audit-Eintrag trägt weiter den echten Akteur.
  - **Agenten:** Token-Zwang für Farb-Literale (nur bei existierendem Kandidaten), keine
    `ambient`-Regeln, kein `rawCss`, keine Selektor-Patches; geprüft werden **nur die
    Patch-Bags** bzw. beim Create die erzeugte Regel, damit Alt-Werte (vor der Fence) einen
    unrelated Edit nicht blockieren.
  - **rawCss-Grenzen für alle Schreiber** in `#assertWritableRule`: max. 2.000 Zeichen,
    kein `url()`-Fremdhost; `@import`/Markup waren bereits durch `isSafeRawCss` gesperrt.
  - **Scoped-Selektor** ist strukturell der eigene Knoten-Anker (generiert aus der nodeId);
    nur `ambient` trägt einen freien Selektor, und den setzt kein Agent.
  - `reorderStyleRule`: fremde Provenienz wird audit-markiert (`params.foreignAuthoredBy`),
    Reorder selbst bleibt erlaubt.
- **Fehlerform:** alle Ablehnungen `SenifyError` category `validation` mit dotted field
  (`rule.styles.background`, `rule.states.hover.color`, `rule.contextStyles.<id>.color`,
  `rule.kind`, `rule.rawCss`, `rule.selector`) und Suggestion mit dem Token-Vorschlag
  (`{ $token: "accent" }`).

**Tests (Gate):** `packages/engine/test/agent-style-gate.test.ts` (9 Fälle, je Regel
Ablehnung **und** Durchlass): Raw-Hex → 400 mit Feld/Suggestion und **nichts geschrieben**
(Registry leer, kein Audit-Eintrag); Token-Referenz + Freiwerte erlaubt; Primitive-Vorschlag
`color.brand`; Editor-Rohwerte erlaubt; Provenienz aus Token (Body-Fälschung schlägt fehl);
States/Context-Bags gefenct; Update-Fence + unveränderte Regel + Audit-Akteur `engine-tests`;
ambient/rawCss nur Mensch, Selektor-Patch verboten; Reorder-Marker; rawCss-Länge/Fremdhost;
Scoped-Anker. Bestehende Suiten auf die Token-Semantik gezogen (`bake.test.ts` ambient-Regel
→ `HUMAN_AUTHOR`, `app/test/save-pipeline.test.ts` erwartet `user` statt `author`-Body).

**Hinweis zur Testdatei:** abweichend vom Vorschlag liegt sie flach als
`packages/engine/test/agent-style-gate.test.ts` — `engine/test/` hat keine
`mutations/`-Unterstruktur, und alle Engine-Suiten liegen flach.

**Abnahme:** Testdatei zeigt je Regel Ablehnung (mit field/suggestion) und Durchlass; ein
Agent-Batch mit Roh-Hex bei vorhandenem Token schlägt fehl, **ohne** etwas zu schreiben; die
Transaktionsgarantie des Store-Pfads bleibt intakt (die Fence wirft vor `#writeStyleRules`).

## Zahlen Scheiben 2+3 (19.09.)

`pnpm test` **1210 grün / 2 übersprungen / 134 Dateien**, typecheck 0, lint 0
(Log `.scratch/testlauf-19-09-ticket18s23.log`). Ticket 18 ist damit vollständig umgesetzt
(committet als `824b9ba`); die E3-Akzeptanzen (Author aus Token, Idempotenz, Fence,
Annotations-Matrix) sind belegt.
**Offen im Umfeld (nicht dieses Ticket):** Audit-Lücken Page-Create/Delete, Assets,
Referenzen (E3-Aufzählung) — eigenes Paket.
