# Senify — Referenz-Redesign

Lade diese Datei für „baue Seite X im Stil einer Referenz neu“, „übernimm diese Referenz“ oder „redesigne mit Referenz A und B“. Ziel ist ein neuer bearbeitbarer Draft nach einer **menschlichen** Richtungsentscheidung, kein 1:1-Klon und keine Veröffentlichung ohne Freigabe.

## Eingaben

Vor dem ersten Write brauchst du:

- `siteId` und `pageId` der Quellseite,
- eine bis drei `referenceIds` aus der Bibliothek.

Die Richtung selbst wählt **ein Mensch**. Du schickst nie Cards, Theme-Patches oder Entscheidungen.

## Workflow

1. **Vault zuerst:** `search_references` oder `list_references`; `find_duplicate_references` vor einer neuen URL. Lies mit `get_reference`, `get_reference_brief` und `get_reference_docs` Profil, Regeln, Vokabular und Evidenz.
2. **Nur planen:** `plan_redesign` mit der Quell-`pageId` und den Kandidaten-IDs. Das Paket schreibt nichts. Vergleiche `targets[]` und nenne pro Richtung Theme-Patch, Regeln, Dokumentlage und Risiken.
3. **Vorschlag anlegen:** `create_redesign_proposal` mit derselben `pageId`, den Kandidaten-IDs und einem stabilen `idempotencyKey`. Der Server leitet die Direction Cards selbst ab und speichert sie unveränderlich inklusive Bild, Theme-Specimen, Begründung, Regeln und Warnungen.
4. **Warten:** Der Mensch wählt im Programm eine Richtung. Es gibt **kein** Bestätigungs-Werkzeug; ein Agent kann nicht entscheiden. Frage nach dem Stand mit `get_redesign_proposal`, statt zu raten.
5. **Übergabe übernehmen:** Ist der Status `applied`, nimm `siteId` und `pageId` aus `applyResult`. `applyResult.scope` ist `scaffold-theme` und `sectionPlanApplied` ist `false`: bestätigt wurden Theme und Draft-Grundstruktur, **nicht** die Sections. Der Apply lief in einer Transaktion, entweder alles oder nichts.
6. **Sektions-Plan umsetzen:** Der `sectionPlan` der bestätigten Card ist die verbindliche Baugrundlage. Pro Quell-Section nennt er Zieltyp, Zielvariante mit vollständigem Preset, erhaltene Inhaltsschlüssel und den Medienbedarf. Setze genau diesen Plan um: pro Seite `get_page`, dann `get_section` und `apply_mutations` mit aktuellem `baseDraftVersion`. Ein Variantenwechsel materialisiert das Preset vollständig; ein Variante allein zu setzen reicht nicht. Medien mit `reuse` weiterverwenden, `select`/`upload`/`generate` erledigen, `avoid` nie übernehmen.
7. **Prüfen:** `get_design_report` und `diff_reference`. Billige harte Findings beheben, dann beide Prüfungen wiederholen.
8. **Vorschau und Review:** `create_preview`; die signierte URL an den Menschen geben. `submit_for_review` erzeugt das Review mit Preview und Struktur-Diff, `get_review_feedback` liest den Stand.
9. **Stoppen:** `publish_release` erst nach ausdrücklicher menschlicher Freigabe.

## Grenzen

- Originalsite und aktives Release bleiben unangetastet.
- Nur der Human-Programm-Proxy darf bestätigen; `apply_redesign` ohne Proposal bleibt der autonome Legacy-Weg.
- Der Sektions-Plan ist Angebot und Arbeitsauftrag, kein ausgeführter Write: `commitRedesignApply` erzeugt Scaffold und Theme, `apply_mutations` baut die Sections.
- Inhalte bleiben erhalten; das Design erbt das bestätigte Theme.
- Keine Originaltexte, Logos, Fotos oder identischen Layouts übernehmen.
- Tokens vor Literalen; die Registry ist Gesetz.
- `dry_run: true` bei unsicheren Mutationsbatches; keine erfundenen Sektionen oder Props.
- Asset-Zugriffe brauchen immer die `siteId`: `update_asset`, `replace_asset`, `delete_asset` und `restore_asset` lehnen ein Asset einer fremden Site ab.
- Ein Idempotency-Key schützt den Retry, nicht einen Prozessabbruch zwischen mehreren Schreibpfaden.

## Fertig, wenn

- ein Vorschlag mit serverseitig abgeleiteten Cards inklusive Sektions-Plan vorliegt,
- ein Mensch genau eine Richtung bestätigt hat und der Status `applied` ist,
- die neue `siteId` und eine bearbeitbare Ziel-`pageId` vorliegen,
- der Sektions-Plan der bestätigten Card über `get_page`/`get_section`/`apply_mutations` umgesetzt und gespeichert ist,
- `get_design_report` und `diff_reference` nach dem letzten Write gelaufen sind,
- `create_preview` und `submit_for_review` gelaufen sind,
- kein Release ohne Freigabe veröffentlicht wurde.
