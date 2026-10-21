// Die Paketregeln des Repos, als ausfuehrbare Regel.
//
// Warum eine Regeldatei und nicht eine Liste im Kopf: ADR-0019 hat den Store
// in Fachmodule zerlegt, P3-3 Punkt 4 hat das Manifest in ein eigenes Paket
// gezogen, WEIL eine Paketkante einen Zyklus erzeugt hatte. Diese Zyklen sind
// damit Handarbeit - geschuetzt durch eine Entscheidung im Kopf, nicht durch
// eine Regel im Code. Jeder weitere Umbau, der eine Paketgrenze beruehrt,
// braucht dieselbe Entscheidung noch einmal; eine Regel, die die bereits
// getroffenen Entscheidungen mechanisch prueft, ist billiger.
//
// Jede Regel nennt ihren Grund. Eine Regel ohne Grund ist eine, die beim
// naechsten Umbau niemand mehr nachvollziehen kann.
//
// `dependency-cruiser` meldet nur; es veraendert nichts.

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "docs-portal-mcp-no-dependency",
      severity: "error",
      comment:
        "P3-3 Punkt 4: der Zyklus docs-portal <-> mcp wurde mit dem Manifest-Paket aufgeloest. Die Gegenkante (mcp -> docs-portal) bleibt erlaubt und ist die gewuenschte Richtung.",
      from: { path: "^packages/docs-portal" },
      to: { path: "^packages/mcp" },
    },
    {
      name: "manifest-mcp-no-dependency",
      severity: "error",
      comment:
        "Das Manifest ist neutral: es haelt die Fakten ueber die Werkzeuge und sonst nichts. Es darf nicht vom MCP abhaengen, sonst haelt es wieder einen Zyklus.",
      from: { path: "^packages/manifest" },
      to: { path: "^packages/mcp" },
    },
    {
      name: "engine-does-not-know-the-dashboard",
      severity: "error",
      comment:
        "Die Fassade kennt nur in eine Richtung: app -> engine. Die Engine darf das Dashboard nicht kennen - das waere der Weg zurueck in den Zyklus.",
      from: { path: "^packages/engine" },
      to: { path: "^packages/app" },
    },
    {
      name: "core-knows-nobody",
      severity: "error",
      comment:
        "@senify/core ist die Basis: es haelt keine Fachabhaengigkeit. Alles andere waere eine Kante, die man beim Auslagern einer Fachlogik wieder suchen muss. Die Ausnahme `(?!core/)` laesst dem Paket seine eigenen Module.",
      from: { path: "^packages/core" },
      to: { path: "^packages/(?!core/)" },
    },
    {
      name: "tokens-know-nobody",
      severity: "error",
      comment:
        "@senify/tokens ist der reine Wertspeicher: keine Fachabhaengigkeit.",
      from: { path: "^packages/tokens" },
      to: { path: "^packages/(?!tokens/)" },
    },
    {
      name: "skills-know-nobody",
      severity: "error",
      comment:
        "@senify/skills ist der reine Skill-Katalog: keine Fachabhaengigkeit.",
      from: { path: "^packages/skills" },
      to: { path: "^packages/(?!skills/)" },
    },
    {
      name: "no-new-package-cycle",
      severity: "error",
      scope: "folder",
      comment:
        "Ein Zyklus zwischen Paketen ist eine Entscheidung, keine Zufaelligkeit: der Weg durch drei Pakete hindurch ist beim Lesen des Codes nicht mehr sichtbar. Die Regel gilt auf der Ordnerebene - ein Zyklus zwischen zwei Dateien DESSELBEN Pakets ist eine Frage der Dateiorganisation, keine der Paketgrenze.",
      from: { path: "^packages/" },
      to: { path: "^packages/", circular: true },
    },
  ],
  options: {
    // Die Pfad-Aliase der tsconfig.json aufloesen, damit eine Regel auf dem
    // Paketpfad greift und nicht auf dem Alias-Namen.
    tsConfig: { fileName: "tsconfig.json" },
    // Nur Zyklen, die auch zur Laufzeit bestehen. Ein Zyklus ueber reine
    // Typ-Importe wird vom Compiler aufgeloest (der Import verschwindet) und
    // ist damit kein Zyklus im laufenden Programm - nur in der Lesebarkeit.
    tsPreCompilationDeps: false,
    doNotFollow: { path: "node_modules" },
    // Build-Artefakte sind kein Quelltext: der Bake legt seinen Stage-Ordner
    // unter `packages/renderer/.bake/` an, und der Scanner wuerde ihn mit
    //gehen - mitten im Testlauf ein transienter Fehler, weil die Datei
    // waehrend des Scans wieder verschwindet. Die Artefakte stehen in
    // `.gitignore`; der Scanner soll dasselbe gelten lassen.
    exclude: { path: "(^|/)node_modules/|(^|/)\\.bake/|(^|/)\\.astro/|(^|/)dist/" },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/(@[^/]+/[^/]+|[^/]+)" },
    },
  },
};
