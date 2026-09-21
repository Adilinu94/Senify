# Bildgenerierung 03 — Skill-Pack `images.md` (S3)

Status: resolved
Quelle: `.scratch/bildgenerierung/spec.md` (Scheibe S3).
Blocked by: 02

## Kontext

Der Agent soll ohne Rückfragen wissen, wie er Bilder für ein Projekt erzeugt. Das Wissen gehört
ins Skill-Pack (`packages/skills/skills/`), das `senify setup` nach `~/.senify/skills` kopiert.
`tools.md` wird aus `@senify/mcp/tools` generiert — die neuen Tools erscheinen automatisch.
Wichtig: Der Default-Lauf geht über image-use (≈ 1 min), bei aufgebrauchtem Kontingent übernimmt
automatisch Qwen (9–45 min) — der Agent muss diese Zeitspanne kennen und den Provider im
Job-Status beachten.

## Aufgabe

1. Neu `packages/skills/skills/images.md`:
   - Wann generieren (Bedarf aus Brief/Referenz; eigene Motive statt Stock — `assets.md`-Regeln
     gelten weiter).
   - Ablauf: `get_reference_brief` → `imagePrompt` (oder eigenes Motiv) → `generate_image` →
     `get_image_job` pollen (≥ 60 s, nicht spammen) → `assetId` → `assetRef`.
   - Provider und Zeiten: Default **image-use ≈ 1 min**; bei aufgebrauchtem Kontingent
     **automatischer Qwen-Fallback 9–45 min** (512² ≈ 9 min, 1024² ≈ 25–45 min, 2K auf dieser
     Maschine ungeeignet) — `providerUsed` im Job-Status lesen, nicht raten.
   - Prompt-Rezept: natürliche Sprache; Subjekt + Setting + Licht + Material + Perspektive; Text im
     Bild wörtlich in Anführungszeichen; Transparenz explizit anfordern; keine Keyword-Stapel.
   - Größen: Vielfache von 32; im Zweifel klein testen.
   - Fehlerfälle: OOM → kleinere Auflösung; beide Provider nicht verfügbar → Operator informieren;
     `failed` → `error` lesen; `provider off` → Einstellungen.
   - Alt-Text-Pflicht direkt bei `generate_image` mitgeben.
   - Grenzen: keine fremden Logos/Personen; Lizenzhinweis (Qwen Research License, Prüfung offen).
2. `router.md`: Zeile „Bilder für ein Projekt erzeugen → `images.md`, dann `generate_image` →
   `get_image_job`".
3. `assets.md`: Punkt „Quelle wählen" um die Engine-Generierung als erste Option ergänzen, wenn
   der Provider aktiv ist.
4. `packages/skills/test/skills.test.ts` bei Bedarf anpassen.

## Akzeptanz

- `senify setup` kopiert `images.md` nach `~/.senify/skills`; das generierte `tools.md` enthält
  `generate_image`/`get_image_job`.
- Trockenprüfung: Allein mit `images.md` + `tools.md` ist der Ablauf vollständig beschrieben
  (Prompt → Job → Poll → `assetRef`, inkl. Provider-Zeiten und Fehlerfällen).
- `pnpm verify` grün.

## Referenzen

- `.scratch/bildgenerierung/spec.md` (Skill-Pack, Provider-Kette, S3)
- `packages/skills/skills/assets.md`, `packages/skills/skills/router.md`,
  `packages/docs-portal/src/skills.ts`, `packages/mcp/src/cli.ts` (`copySkills`)

## Comments

Umgesetzt (21.09.2026):

- Neu `packages/skills/skills/images.md`: Wann generieren, Ablauf (`get_reference_brief` → `imagePrompt` → `generate_image` → Poll ≥ 60 s → `assetId` → `assetRef`), Provider-Zeiten (image-use ≈ 1 min; Qwen-Fallback Minuten: 512² ≈ 2–9 min kalt/warm, 1024² ≈ 25–45 min, 2K ungeeignet — `providerUsed` lesen), Prompt-Rezept, Größen (Vielfache von 32), Fehlerfälle (`failed`/OOM/`provider off`/`invalid_input`), Alt-Text-Pflicht, Grenzen inkl. Qwen-Research-License-Hinweis.
- `router.md`: Zeile „Generate images for a project → `images.md`, dann `generate_image` → `get_image_job`" plus Eintrag in den Referenzdateien.
- `assets.md`: „Quelle wählen" startet mit der Engine-Generierung (Provider aktiv), Stock als Alternative.
- `packages/skills/test/skills.test.ts`: Dateiliste um `images.md` erweitert, Test für den kompletten Ablauf (Tools, `providerUsed`, Größenregel, Lizenzhinweis, Router-Verweis).
- Verifiziert: `pnpm vitest run packages/skills/test` grün (5 Tests); `skillReferenceFiles().tools.md` enthält `generate_image` und `get_image_job` (tools.md wird generiert, kein Handpflege-Aufwand).
