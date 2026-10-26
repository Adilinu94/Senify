// Was die Statuszeile des Editors sagt - aus `app-editor.js` (R12).
//
// WARUM NUR DIE RECHNUNG: `applyState` war 26 Zeilen, die zwei Dinge taten -
// aus dem Speicherzustand einen Text ableiten UND ihn ins DOM schreiben. Nur
// der erste Teil traegt Regeln, und genau die waren nirgends geprueft.
//
// DIE REGELN:
//
//   1. Ein Konflikt schlaegt alles andere: steht ein Konflikt an, ist das die
//      Nachricht - nicht "Speichert …" und nicht "Gespeichert".
//   2. Ohne offene Aenderungen ist die Zeile LEER, nicht "0 offen".
//   3. Eine Meldung des Speicherers gewinnt gegen die Ableitung aus dem
//      Zustand; sie ist naeher am Geschehen.
//   4. "Nicht speicherbar" wird ANGEHAENGT, nie ersetzt: sonst verschwaende
//      die eigentliche Meldung hinter der Liste der unspicherbaren Felder.
//
// Die Reihenfolge in Regel 1 und 4 ist der Grund, warum das hier steht: sie
// ist leicht zu vertauschen und im Browser faellt es niemandem auf.

export function saveStatusText(state) {
  const conflict = state?.status === "conflict";
  let text;
  if (state?.status === "saving") text = "Speichert …";
  else if (state?.status === "saved") text = "Gespeichert";
  else if (conflict) text = state?.message ?? "Entwurf wurde geändert";
  else if (state?.status === "error") text = state?.message ?? "Speichern fehlgeschlagen";
  else text = (state?.pending ?? 0) > 0 ? `${state.pending} offen` : "";

  const unsupported = Array.isArray(state?.unsupported) ? state.unsupported : [];
  if (unsupported.length > 0) {
    // Anhaengen, nicht ersetzen. Der Punkt trennt, `trim()` raeumt den Fall
    // "keine Meldung, nur Liste" auf.
    text = `${text} · nicht speicherbar: ${unsupported.join(", ")}`.trim();
    // Fuehrendes Trennzeichen weg, wenn die Meldung leer war.
    if (text.startsWith("·")) text = text.slice(1).trim();
  }
  return text;
}

// Die Knoepfe, die nur im Konflikt erscheinen, und die Beschriftung des
// Speichern-Knopfs. Zusammen mit dem Text ist das der ganze Zustand, den
// `applyState` sichtbar macht.
export function saveControls(state) {
  const pending = state?.pending ?? 0;
  return {
    pending,
    saveDisabled: pending === 0,
    saveLabel: pending > 0 ? `Speichern (${pending})` : "Speichern",
    conflict: state?.status === "conflict",
  };
}
