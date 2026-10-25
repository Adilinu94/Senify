// Was der Editor mit einer fremden Live-Meldung tut - aus `app-editor.js` (R12).
//
// WARUM DIESE ENTSCHEIDUNG EIGEN STEHT: Sie war in der Closure ueber vier
// Handler verteilt, und jede Verzweigung traegt eine Regel, die still
// Datenverlust verursacht, wenn sie falsch ist:
//
//   `ignore`  - die Meldung ist unbrauchbar (kein Objekt, kein pageId).
//   `follow`  - die Aenderung liegt auf einer ANDEREN Seite; die Ansicht darf
//               wechseln, sofern die Agent-Vorschau das erlaubt.
//   `blocked` - die Seite IST die offene, aber es gibt offene eigene
//               Aenderungen: nachladen wuerde sie verwerfen. Also nicht laden,
//               sondern sagen, warum.
//   `reload`  - die Seite ist die offene und nichts ist offen: nachladen und
//               die geaenderten Knoten hervorheben.
//
// Der Fall `blocked` ist der teure: er sieht wie ein normaler Ablauf aus und
// ist der einzige, bei dem ein Nachladen Arbeit zerstoert.

/**
 * @returns {{ action: "ignore" | "follow" | "blocked" | "reload", message?: string }}
 */
export function draftChangedDecision({ payload, pageId, isBusy }) {
  // Ohne Seitenbezug laesst sich nichts zuordnen - ein Ereignis ohne
  // `pageId` ist kein Grund, irgendetwas zu tun.
  const target = payload?.pageId;
  if (typeof target !== "string" || target === "") return { action: "ignore" };

  if (target !== pageId) return { action: "follow" };

  if (isBusy()) {
    return {
      action: "blocked",
      message: "Fremde Änderung erkannt - bitte speichern oder neu laden",
    };
  }

  return { action: "reload" };
}

/**
 * Was nach dem Anlegen einer Seite gilt: die Ansicht folgt, wenn sie darf;
 * sonst bleibt sie stehen und sagt, dass die Seite waehlbar ist.
 */
export function pageCreatedDecision({ payload, followed }) {
  if (followed) return { action: "followed" };
  const target = payload?.pageId;
  // Ohne Kennung gibt es keine Seite, zu der man wechseln koennte.
  if (typeof target !== "string" || target === "") return { action: "ignored" };
  return { action: "hint", message: "Neue Seite angelegt - im Explorer wählbar" };
}

/**
 * Die Knoten, die hervorgehoben werden sollen. Eine fremde Meldung ohne
 * `nodeIds` hebt nichts hervor - aber sie darf auch nicht werfen.
 */
export function nodesToFlash(payload) {
  const ids = payload?.nodeIds;
  if (!Array.isArray(ids)) return [];
  // Nur Strings sind Knoten-Kennungen; Zahlen oder Objekte wuerden im Canvas
  // still nichts treffen und die Liste nur groesser machen.
  return ids.filter((id) => typeof id === "string" && id !== "");
}
