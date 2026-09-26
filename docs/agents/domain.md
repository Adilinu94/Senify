# Domänendokumentation

## Vor der Code-Erkundung lesen

- `CONTEXT.md` für Fachbegriffe und Domäneninvarianten.
- `docs/adr/README.md` für den ADR-Index.
- Die ADRs unter `docs/adr/`, die den bearbeiteten Bereich betreffen.
- `docs/current/stand.md`, `docs/current/architektur.md` und `docs/current/qualitaet.md` für Ist-Stand, Seams und Gates.

Fehlt ein optionaler Kontext oder eine optionale ADR, gilt der vorhandene Single-Context in `CONTEXT.md` und `docs/adr/`.

## Strukturvorgabe

```text
/
├── CONTEXT.md
├── docs/
│   ├── README.md
│   ├── current/
│   │   ├── stand.md
│   │   ├── architektur.md
│   │   └── qualitaet.md
│   └── adr/
└── src/
```

## Sprache verwenden

Wenn ein Artefakt einen Domänenbegriff nennt, verwendet es die Definition aus `CONTEXT.md` und keine vermeintlichen Synonyme. Fehlt ein notwendiger Begriff, wird das als echte Lücke dokumentiert, nicht durch ein neues Wort verdeckt.

## Widersprüche offenlegen

Widerspricht ein Vorschlag einer angenommenen ADR, wird das ausdrücklich genannt. Keine bestehende Entscheidung wird durch einen stillen Code- oder Dokumentationswechsel umgangen.
