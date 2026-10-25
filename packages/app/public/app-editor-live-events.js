// Die zwei Regeln am Live-Kanal (Ticket 05) - aus `app-editor.js` (R12).
//
// WARUM EIGENES MODUL: Beide Funktionen sind reine Rechnung ohne DOM, ohne
// Session und ohne Canvas - und beide tragen eine Regel, die ein Fehler still
// kaputtmacht:
//
//   `parseEngineEvent`: ein kaputter Frame darf den Editor NICHT aus dem Tritt
//   bringen. Statt zu werfen kommt ein leeres Objekt zurueck; der Aufrufer
//   entscheidet dann, dass er nichts damit anfangen kann.
//
//   `isOwnEvent`: die eigenen Schreibvorgaenge des Programms sind kein
//   "Agent baut". Wuerde das verwechselt, laedt der Editor nach jeder eigenen
//   Aenderung die Seite neu - und verwirft dabei die offenen Aenderungen.
//
// Der Actor-Name kommt herein, damit ein Test ihn festhalten kann.

export function parseEngineEvent(event) {
  // `event` kann fehlen (ein Test, ein Ereignis ohne Daten) und `data` kann
  // kein JSON sein. Beides ist derselbe Fall: nichts verwertbares.
  try {
    const raw = event?.data ?? "{}";
    const parsed = JSON.parse(raw);
    // Ein Array oder ein Skalar ist formal JSON, aber kein Ereignis. Der
    // Aufrufer greift auf `payload.actor`/`payload.pageId` zu; ohne Objekt
    // waere das ein Fehler an einer ganz anderen Stelle. `typeof []` ist
    // "object" - die Array-Pruefung muss deshalb davor stehen.
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

export function isOwnEvent(payload, authorLabel) {
  // Ohne Actor ist es kein eigenes Ereignis - ein fremder Schreiber ohne
  // Etikett soll nicht als "meins" durchgehen.
  const label = payload?.actor?.label;
  if (typeof label !== "string") return false;
  return label === authorLabel;
}
