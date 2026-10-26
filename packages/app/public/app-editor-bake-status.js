// Der Re-Bake-Status am Canvas (E12) - aus `app-editor.js` (R12).
//
// WAS ER TUT: fragt einmal die Bake-Jobs der Site und schreibt EINE Zeile:
// laeuft der Job, ist er fertig, ist er gescheitert. Der Badge ist ein
// Hinweis, kein Blocker - ein fehlgeschlagener Abruf laesst ihn einfach aus.
//
// WARUM EIGENES MODUL: Der Block kannte seinen Host (`statusGroup`), seinen
// Site-Kontext und das `api`-Helferlein - sonst nichts. Kein Canvas, keine
// Auswahl, kein Speichern. Genau die Naht, die R12 beschreibt.

// Die Reihenfolge ist die Regel: der ERSTE Job ist der juengste (die Route
// sortiert absteigend). Ein alter "done"-Job darf einen laufenden nicht
// ueberdecken.
const LAEUFT = new Set(["queued", "running"]);

export function bakeStatusText(job) {
  if (job === null || typeof job !== "object") return null;
  if (LAEUFT.has(job.status)) return { text: "Inhalt wird neu gebaut …", error: false };
  if (job.status === "failed") {
    return { text: `Re-Bake fehlgeschlagen: ${job.lastError ?? "unbekannt"}`, error: true };
  }
  if (job.status === "done") return { text: "Inhalt neu gebaut", error: false };
  // Ein Status, den diese Fassung nicht kennt (etwa ein neuer), ist kein
  // Fehler und keine Fertigmeldung: dann schweigt der Badge.
  return null;
}

export function createBakeStatus({ el, fetchJobs }) {
  const badge = el("span", {
    class: "muted",
    "data-role": "bake-status",
  });
  badge.hidden = true;

  const show = (text, isError) => {
    badge.textContent = text;
    badge.hidden = false;
    if (isError) badge.dataset.state = "error";
    else delete badge.dataset.state;
  };

  const refresh = async () => {
    let result;
    try {
      result = await fetchJobs();
    } catch {
      // Der Status ist ein Hinweis, nie ein Blocker.
      return null;
    }
    const job = Array.isArray(result?.jobs) ? result.jobs[0] : undefined;
    const shown = bakeStatusText(job ?? null);
    if (shown === null) return null;
    show(shown.text, shown.error);
    return shown;
  };

  return {
    element: badge,
    refresh,
    // Die Live-Ereignisse (`bake.done`/`bake.failed`) melden das Ergebnis
    // direkt; sie gehen an derselben Stelle vorbei wie die Job-Abfrage.
    show(text, isError = false) {
      show(text, isError);
    },
  };
}
