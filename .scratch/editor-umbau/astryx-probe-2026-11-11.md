# Astryx: isolierter Dialog- und Inspector-Prototyp

Stand: 11.11.2026. Ein eigenständiger Prototyp außerhalb des Senify-Repositories wurde mit `@astryxdesign/core` und `@astryxdesign/theme-neutral` Version 0.7.13, React und esbuild gebaut. Er nutzt lokale Testdaten; es erfolgte keine Integration in den Editor und kein Zugriff auf Senify-Projekte.

## Praktische Prüfung

Ein `TextInput` bearbeitet einen Testklassennamen; ein `Dialog` zeigt eine Löschbestätigung. Der korrigierte Build wurde im Browser manuell geprüft: Eingabe, Öffnen, Abbrechen, Bestätigen, Escape, Fokuswechsel innerhalb des Dialogs und Rückkehr des Fokus zur auslösenden Schaltfläche. Der Dark Mode wurde umgeschaltet. Bei 390 × 844 passte der geöffnete Dialog im getesteten Zustand ohne horizontalen Seitenüberlauf in den Viewport.

Praktischer Integrationshinweis: `TextInput.onChange` liefert den Wert als erstes Argument, nicht das DOM-Event. Der Typ in `TextInput.d.ts` bestätigt die Signatur. Der Versuch setzt `data-theme` und `data-astryx-theme` am Dokumentelement; Auswirkungen auf Senifys vorhandene CSS- und Theme-Logik sind vor einer Integration zu prüfen.

Der minifizierte eigenständige Probe-Build umfasst rund 541 KB JavaScript und 292 KB CSS unkomprimiert. Er enthält auch React und das Theme und erlaubt keine Aussage über den tatsächlichen zusätzlichen Bundle-Anteil in Senify.

## Einordnung und offene Prüfung

Astryx ist für einen begrenzten Integrationsversuch mit echten Senify-Komponenten grundsätzlich untersuchbar; aus diesem Prototyp folgt keine Empfehlung zur vollständigen Migration. Es fehlen eine Anbindung an den bestehenden Inspector und dessen History, ein Test der CSS-Isolation und Theme-Wechselwirkungen, ein vergleichbarer Produktions-Bundle-Messlauf sowie automatisierte und manuelle Accessibility-Prüfungen einschließlich Screenreader. Auch Wartbarkeit, bestehende Komponenten und Lizenzbedingungen müssen vor einer Übernahme bewertet werden.

Der Prototyp liegt lokal unter `C:/Users/adini/.codex/visualizations/2026/11/04/01a1a6ea-a65c-7161-89e3-b25fdcb81c75/astryx-probe/`. `src/main.jsx` enthält die Testoberfläche; Start im Prototypordner mit `node serve.mjs`. Er ist nicht Teil des Git-Commits und muss bei Bedarf gesondert gesichert werden.
