# Editor-Alignment: Instatic-Muster

Type: grilling
Status: resolved

Input: research/23-instatic-deepdive.md
Input: research/24-payload-learnings.md
Input: research/26-instatic-delta.md
Input: artifacts/09-editor.md

## Question

Nutzer-Anforderung („visueller Editor ähnlich Instatic") + Deep-Dive: Welche Muster übernehmen wir auf der Puck-Basis (09)?

Kandidaten aus der Instatic-Analyse:
- **Design-Modus mit Breakpoint-Frames nebeneinander** (Zoom/Pan) + **Live-Modus** (ein Frame in echter Größe, normal scrollbar)
- **Inline-Text-Editing** (Doppelklick → `contentEditable` auf dem echten Element; live in alle Breakpoints; Escape = Revert)
- **Explorer-Panel mit Tabs** (Layers/Site/Media), Site-Explorer mit Ordnern
- **Cmd+K-Spotlight** · **URL-Deep-Links** (`?page=`) · **Media-Panel im Editor**
- Selection-/Hover-Rings, Alt-Inspect-Ladder, Selected-Layer-Toolbar

Welche sind v1-pflicht, welche später? Was liefert Puck out-of-the-box, was bauen wir selbst (Gap-Analyse + Aufwand)?

Ergebnis: erweitertes Editor-Konzept (Delta zu Artefakt 09).

## Answer

**Entschieden am 15.09.2026 (Wizard, 8/8) — Artefakt: [artifacts/24-editor-alignment.md](../artifacts/24-editor-alignment.md) · Gap-Analyse: [research/28-puck-gap.md](../research/28-puck-gap.md)**

- **Zwei Modi (v1):** Design-Modus mit Breakpoint-Frames nebeneinander (Zoom/Pan, Start ~50 %, alle editierbar) + Live-Modus (ein Frame, echte Größe, scrollbar). **Frame-Manager als Eigenbau-Schicht** (Puck rendert nur einen Frame) — größter Einzelaufwand (L), bewusst in v1.
- **Inline-Text-Editing (v1):** Doppelklick → tippen (plaintext); committet live in alle Breakpoints via `updateNodeProps`; Escape = Revert, ein Undo-Eintrag. Puck-Basis OOB + Senify-Delta.
- **Explorer-Tabs:** Ebenen · Seiten (inkl. **Vorlagen**-Abschnitt für Layouts/Entry-Templates) · Medien; rechte Leiste Eigenschaften/Theme/Motion wie 09.
- **Cmd+K-Spotlight, URL-Deep-Links (`?page=&node=&mode=&bp=`), Medien-Fenster:** alle v1.
- **Feinschliff komplett:** Selection-/Hover-Rings, Alt-Inspect-Ladder, Element-Toolbar (Override, M).
- **Gap-Analyse (Puck v0.23, geklont):** OOB = Inline-Basis, iframe, Slots/Fields; Override = Live-Modus, Explorer-Tabs, Rings/Toolbar; Eigenbau = Multi-Frame (L), Spotlight (M), Deep-Links (S), Medien-Fenster (M).
- **Risiken:** Puck 0.x (Version pinnen + Upgrade-Tests); bekannte Bugs #1829 (ActionBar-Overlay), #1794 (Inline im Root) einplanen.
- **Abgrenzungen:** Content-Workspace + Entry-Live-Vorschau bleiben eigener Bereich (22/23); Review bleibt im Projekt (06); kein In-Editor-Agent (09).
- **Umsetzungsreihenfolge (Vorschlag):** Frame-Manager → Panels → Inline-Delta → Spotlight/Deep-Links/Medien → Feinschliff.
