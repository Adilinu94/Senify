# ADR-0029: Deklarative Animationen aus Framer-Importen

Status: angenommen · 03.11.2026
Ergänzt: [ADR-0006](0006-motion-authoring.md), [ADR-0003](0003-gsap-als-choreografie-kern.md)

## Kontext

Die Preset-Skala von ADR-0006 kann Startwerte, Zeit und Bézier-Kurven eines Framer-Exports nicht verlustfrei ausdrücken. Das Beispielprojekt enthält Appear-Tweens mit expliziten Werten. Browserinstrumentierung bestätigt, dass Framer auf der Startseite diese Effekte mit Web Animations API (WAAPI) ausführt. Das ist kein Beleg für alle Framer-Effekte.

## Entscheidung

Ein eng begrenztes importiertes Appear-Preset darf zusätzlich deklarative, typisierte Start- und Endwerte, Millisekunden und eine Bézier-Kurve tragen. Es bleibt Teil der vorhandenen Motion-Spec und Registry; die Werte sind Daten, kein ausführbarer Fremdcode. Editor, Engine, Vorschau und Build müssen dieselbe Spec erhalten. Für diesen begrenzten Typ ist die browserseitige WAAPI als lokal verfügbare Wiedergabe neben GSAP zugelassen. Bestehende Presets und ihre Runner bleiben unverändert.

Zunächst sind nur aus der Quelle tatsächlich gelesene Tweens mit identischen Breakpoint-Varianten und unterstützten Werten erlaubt. Abweichende Varianten, Springs, unbekannte Eigenschaften oder ungeklärte Trigger bleiben Funde; sie dürfen nicht als exakt ausgegeben werden. Numbers, Dauer und Kurven werden begrenzt und validiert. Reduced Motion und ein sichtbarer statischer Endzustand bei Fehler bleiben verpflichtend.

Die Ausführung muss für Canvas und Bake gemeinsam abgeleitet werden. Ein Browservergleich misst einzelne Effekte über mehrere Zeitpunkte und Viewports gegen das Original; ein passender Kurvenverlauf beweist weder identisches Startverhalten beim Laden noch die vollständige Site. Die Bearbeitung der Werte muss über den bestehenden Spec-Vertrag möglich sein; ein gesondertes komfortables Timeline-UI ist nicht Teil dieser Entscheidung.

## Folgen

Die geschlossene Registry bleibt maßgeblich, wird aber um ein datengetriebenes Preset erweitert. Diese begrenzte Ausnahme ersetzt nicht die spätere Entscheidung über vollständige Timelines, Scroll-Kopplung und Interaktionszustände. Kein importiertes Skript und keine Framer-Site-Runtime werden damit übernommen.
