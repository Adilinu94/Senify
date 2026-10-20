# Fixture-Gate: Höhen- und Pixel-Lücken finden

Das Fixture-Gate (`packages/framer-import/test/import-fixture-gate-browser.test.ts`) vergleicht Original und Import
bei Desktop, Tablet, Mobil und 1024 px. Wenn eine Seite zu kurz oder zu lang ist, zeigt das Gate nur Zahlen. Dieses
Rezept findet das Element, das sie verursacht. Es ist zwischen dem 16. und 18.10.2026 an drei Ursachen erprobt worden.

## Warum über die CI

In der Agenten-Sandbox gibt es kein Chromium (der Playwright-Download ist gesperrt), und die Job-Logs der CI sind
nicht erreichbar (die Log-Adresse leitet auf einen gesperrten Blob-Speicher um). Messen geht deshalb nur in der CI,
und herausholen lässt sich das Ergebnis nur als **Annotation**.

## Ablauf

1. **Branch anlegen** (`claude/scratch-<thema>-<datum>`, nie mergen) und in `.github/workflows/verify.yml` alle vier
   Jobs mit `if: false` abschalten. Dazu kommt ein Job `probe` (ubuntu-24.04, Node 24, `pnpm install`,
   `pnpm exec playwright install --with-deps chromium`), der den Messtest ausführt.
2. **Messtest als Kopie des echten Gates bauen**, nicht neu schreiben: Die Vorbereitung (gleiche Inter-Datei auf beiden
   Seiten, Breakpoints der Site, aufgelöste Einblendungen) muss Zeichen für Zeichen dieselbe sein. Ersetzt wird nur
   der Messteil nach dem Start der beiden Server.
3. **Ergebnis als Textdatei schreiben** und im letzten Schritt (`if: always()`) als `::error title=…::`-Annotationen
   ausgeben, in Stücken zu höchstens 2 800 Zeichen und höchstens zehn je Schritt. Eine längere Annotation wird bei
   etwa 4 KB abgeschnitten. Prozent- und Zeilenumbruch-Zeichen müssen für Workflow-Befehle maskiert werden
   (`%` → `%25`, Zeilenumbruch → `%0A`).
4. **Lauf starten**: `POST /repos/{owner}/{repo}/actions/workflows/verify.yml/dispatches` mit dem Branch als `ref`.
   Der Lauf dauert etwa drei Minuten.
5. **Zahlen lesen**: `GET /repos/{owner}/{repo}/check-runs/{job-id}/annotations`. Die Job-Id steht unter
   `GET /actions/runs/{run-id}/jobs`.

## Methode: in den größten Unterschied absteigen

Der Messtest vergleicht Schicht für Schicht die **Layouthöhen** (`offsetHeight`, nicht `getBoundingClientRect`, denn
Transformationen verfälschen die zweite) der Kinder je Container und steigt in das Kind mit dem größten Betrag der
Differenz ab, bis die Kinder gleich hoch sind oder ein Blatt erreicht ist. Am Blatt werden berechnete Werte beider
Seiten ausgegeben: Anzeige, Flex-Richtung, Abstände, Zeilenhöhe, Schrift, natürliche Breite, Zeilenbreiten (per
`Range`) und die Vorfahren-Kette. Danach sucht man die Regel statisch: im Original im Stylesheet der Fixture, im
Import im gebackenen CSS (`[data-node-id="…"]`, mit der umschließenden `@media`-Regel).

Fallen:

- Elemente mit `display: contents` haben keine Box. Beim Absteigen müssen ihre Kinder aufgeklappt werden.
- Ein `| tee` in einem `run`-Schritt versteckt das Scheitern des Tests, weil die Standard-Shell ohne `pipefail`
  läuft. Der Lauf steht dann auf grün. Fehlt der Block eines Fixtures in der Ausgabe, ist sein Test fehlgeschlagen,
  bevor er geloggt hat.
- In Vorlagen-Strings (Skripte, die als Text an den Browser gehen) muss ein reguläres `\s` als `\\s` stehen, sonst
  verschwindet der Backslash und die Regel passt auf ein `s`.
- Zuerst die offenen PRs und Branches ansehen. Andere Sessions arbeiten am selben Code; zweimal ist dieselbe Ursache
  doppelt bearbeitet worden (#45 gegen #47 und #49 gegen #51).

## Bisher gefundene Ursachen

| Ursache | Wirkung | Lösung |
|---|---|---|
| `var(--framer-aspect-ratio-supported, 345px)` ohne den `@supports`-Block | feste Pixelhöhe statt Seitenverhältnis | PR #47 |
| Klassenregel auf demselben Element schlägt das `style`-Attribut auf Tablet und Handy | Text brach nicht um | PR #51 |
| `-webkit-line-clamp` wird von der Normalisierung verworfen | Absatz drei statt zwei Zeilen | PR #51 |
| Schriften und Bilder | als Ursache gemessen und ausgeschlossen (gleiche Höhen mit gleichen Schriften und demselben Ersatzbild) | – |

## Wo die Werkzeuge geblieben sind

Die Messtests lagen auf Scratch-Branches, die am 18.10.2026 gelöscht wurden. Die Commits lassen sich per SHA
zurückholen, solange GitHub sie vorhält: `fc92607a8c` (Messläufe zu Schrift und Layout mit `scratch-layout-snap.ts`, in der Historie des Branches),
`c8adff327b` (automatischer Abstieg), `a4460139d8` und `5ad996a6df` (Workflow, der das echte Gate ausführt und seine
Zahlen als Annotation ausgibt). Wer das Rezept öfter braucht, sollte den Abstiegs-Test als Skript unter `scripts/`
einchecken.
