# Der Store wird Fassade über Fach-Module

Status: vorgeschlagen · 08.10.2026
Bezug: Risiko R12 (God-Files), Fahrplan P3-2. Variante A am 08.10.2026 von Adi im Frage-Dialog gewählt.

**Problem.** Die Klasse `Store` (`packages/engine/src/store.ts`, Zeilen 1190–8177) hat 252 Methoden und rund
6 990 Zeilen. Row-Typen und Mapper sind bereits ausgelagert (P3-2, Schritte 1 und 2); was bleibt, ist die
Operationslogik selbst. Jede Änderung an einem Fachgebiet (Formulare, Einstellungen, Assets, Releases) öffnet
dieselbe Datei, und ein Merge-Konflikt zwischen zwei Strängen ist dort wahrscheinlicher als sonstwo.

**Befund, auf dem die Entscheidung beruht** (Stand `ab29774`):

- Der Zustand des `Store` ist klein: `#db`, `#secretFile` und `#engineSecret`. Das Secret wird lazy genau einmal
  aufgelöst („one resolution per Store“) und muss deshalb **geteilt** weitergegeben werden, nicht je Modul neu
  aufgelöst.
- 17 Transaktionen (`Db.withTransaction`), jede **innerhalb einer** Methode. Kein Helfer reicht eine Transaktion
  über Methodengrenzen weiter, außer `#importJobWithClient`. 14 Transaktionen liegen in einem Fachgebiet. Drei
  überspannen mehrere: `applyRedesignPlan` (Proposals, Pages, Sites, Themes), `duplicateSiteWithPlan` (Sites,
  Pages, Themes, Collections, Entries) und `commitFramerImportPlan` (sieben Tabellen).
- 73 Aufrufe öffentlicher `Store`-Methoden untereinander (z. B. `createSite` ruft `getEngineSettings`).
- Der Formular-Block (`getOrCreateFormSecret` bis `listFormSnapshots`, sechs Methoden) greift nur auf `#db` zu,
  hat keine Transaktion und kein Secret. Seine Aufrufer sind `forms.ts` und `index.ts`.

**Entscheidung.**

1. Ein Fachgebiet wird eine Klasse in einer eigenen Datei `packages/engine/src/store-<fachgebiet>.ts`, benannt
   `<Fachgebiet>Repository`. Sie bekommt im Konstruktor ihre Abhängigkeiten (zunächst nur `Db`) und enthält die
   Operationen unverändert.
2. `Store` bleibt die einzige öffentliche Oberfläche. Er hält je Modul eine Instanz und **delegiert** in einer
   Zeile pro Methode. Signaturen, Fehlerarten und Rückgabewerte der öffentlichen API ändern sich nicht; kein
   Aufrufer wird angepasst.
3. Ein Modul kennt den `Store` nicht. Braucht es ein anderes Fachgebiet, bekommt es dessen Modul als
   Konstruktor-Abhängigkeit, nie den `Store`. Die Abhängigkeitsrichtung ist damit azyklisch und im Konstruktor
   sichtbar.
4. **Transaktionen gehören dem Aufrufer, nicht dem Modul.** Eine Operation, die ein Modul in einer Transaktion
   ausführen soll, nimmt einen `DbClient` entgegen (so wie `#readStyleRules(siteId, client = this.#db)` es heute
   schon tut). Die drei fachübergreifenden Transaktionen bleiben vorerst als Methoden am `Store`, der sie aus den
   `DbClient`-Varianten der Module zusammensetzt. Sie werden erst angefasst, wenn die beteiligten Fachgebiete
   ausgelagert sind, und dann einzeln und mit dem Rollback-Test (`redesign-transaction.test.ts`,
   `transactions.test.ts`) als Beweis.
5. Das geteilte Engine-Secret wird nicht kopiert: ein Modul, das es braucht, bekommt eine Funktion
   (`() => Promise<string>`), die auf die eine Auflösung des `Store` zeigt.
6. Ein Schritt = ein Fachgebiet = ein Commit. Die bestehenden Tests sind der Beweis, dass sich nichts ändert; ein
   neuer Test für das Modul wird **vor** dem Code geschrieben und ist ohne ihn rot.
7. Reihenfolge: Formulare (sechs Methoden, keine Transaktion), danach die Einstellungen (acht Methoden, ebenfalls
   ohne Transaktion), danach die Fachgebiete mit Einzeltransaktionen. Die drei fachübergreifenden kommen zuletzt.

**Folgen.**

- `store.ts` schrumpft schrittweise, ohne dass die öffentliche API oder ein Aufrufer sich ändert; jeder Schritt
  lässt sich einzeln zurücknehmen.
- Die Fassade bleibt eine lange Datei aus Einzeilern. Das ist gewollt: sie ist die eine Stelle, an der man die
  gesamte Oberfläche sieht.
- Ein neues Fachgebiet hat einen klaren Ort. Ein Strang, der Formulare ändert, berührt `store-forms.ts` und nicht
  mehr die Datei, in der auch Releases und Assets stehen.

**Verworfen.**

- *B: mehrere Stores und alle Aufrufer anpassen.* Am Ende sauberer, aber ein Großumbau mit gebrochener API und
  dem Risiko, 73 interne Querverweise gleichzeitig umzuhängen.
- *C: Mixins oder `Object.assign`.* Verliert die Typen, versteckt Abhängigkeiten und lässt private Felder (`#db`)
  nicht sauber teilen.
- *Module, die den `Store` kennen.* Würde einen Zyklus bauen, den erst das gebaute Bundle zeigt (vgl. die
  Erfahrung mit dem Manifest-Paket in P3-3, Punkt 4).

**Offen.**

- Ob die Fassade am Ende ein Interface pro Fachgebiet bekommt, entscheidet sich nach den ersten zwei Schritten;
  vorher wäre es eine Abstraktion für Einmalcode.
- Die Zerlegung von `http.ts`, `mcp/tools.ts` und `app.js` (P3-2, Reihenfolge im Fahrplan) ist nicht Teil dieser
  Entscheidung.
