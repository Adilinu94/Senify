# Data-URL-Grafiken als lokales Asset übernehmen

Status: ready-for-agent
Label: ready-for-agent

## Befund

Relay `/` meldet 48, `/contact` 16 Grafiken als Data-URL in einem Stilausdruck; sie werden nach ADR-0005 nicht übernommen. Im Build fehlen dadurch sichtbare Flächen. Auf `/` wird das Badge-Icon als schwarzer Fleck statt als Ring gezeichnet, auf `/contact` fehlen mehrere kleine Grafiken. Drei `css-value-dropped`-Warnungen betreffen `backgroundImage`.

## Nächster Schritt

1. Data-URLs beim Import dekodieren und als lokale Asset-Datei speichern, statt sie in CSS zu schreiben.
2. Den Stil auf die Asset-Adresse umschreiben; die Sicherheitsgrenze aus ADR-0005 bleibt erhalten, weil kein Data-URL im ausgelieferten CSS landet.
3. Einen Test mit einer Data-URL als Hintergrundbild ergänzen: Asset existiert, CSS enthält keine Data-URL, der Build rendert die Grafik.

## Abnahme

Ein Data-URL-Hintergrund wird als lokales Asset dargestellt. Der Bericht zählt weiterhin die Quelle, aber der sichtbare Verlust entfällt. Der Relay-Vergleich zeigt das Badge-Icon als Ring.
