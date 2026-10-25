import { describe, expect, it } from "vitest";
import { isOwnEvent, parseEngineEvent } from "../public/app-editor-live-events.js";

// Die zwei Regeln am Live-Kanal (Ticket 05), R12-Schnitt aus `app-editor.js`.
//
// Beide sind reine Rechnung und trugen eine stille Regel:
//
//   `parseEngineEvent` darf nie werfen - ein kaputter Frame ist kein Grund,
//   den Editor aus dem Tritt zu bringen.
//   `isOwnEvent` verhindert, dass eine eigene Aenderung als "Agent baut"
//   gilt - sonst laedt der Editor nach und verwirft die offenen Aenderungen.

describe("parseEngineEvent", () => {
  it("liest ein normales Ereignis", () => {
    const payload = parseEngineEvent({
      data: JSON.stringify({ actor: { label: "Agent" }, pageId: "p1", action: "insertNode" }),
    });
    expect(payload).toEqual({ actor: { label: "Agent" }, pageId: "p1", action: "insertNode" });
  });

  it("gibt bei kaputtem JSON ein leeres Objekt zurueck statt zu werfen", () => {
    // Ein abgeschnittener Frame kommt im Betrieb vor; er darf die Ansicht
    // nicht aus dem Tritt bringen.
    expect(parseEngineEvent({ data: "{kaputt" })).toEqual({});
    expect(parseEngineEvent({ data: "" })).toEqual({});
  });

  it("behandelt ein Ereignis ohne Daten wie ein leeres", () => {
    expect(parseEngineEvent({})).toEqual({});
    expect(parseEngineEvent({ data: null })).toEqual({});
    expect(parseEngineEvent(null)).toEqual({});
    expect(parseEngineEvent(undefined)).toEqual({});
  });

  it("nimmt kein Array und keinen Skalar als Ereignis", () => {
    // Formal JSON, aber der Aufrufer greift auf `payload.actor`/`pageId` zu -
    // ein Array waere dort ein Fehler an ganz anderer Stelle.
    expect(parseEngineEvent({ data: "[1,2,3]" })).toEqual({});
    expect(parseEngineEvent({ data: "\"text\"" })).toEqual({});
    expect(parseEngineEvent({ data: "42" })).toEqual({});
    expect(parseEngineEvent({ data: "null" })).toEqual({});
  });

  it("reicht ein unbekanntes Feld durch", () => {
    // Der Kanal ist offen fuer neue Ereignisarten; der Parser filtert nicht.
    const payload = parseEngineEvent({ data: JSON.stringify({ pageId: "p1", neu: 7 }) });
    expect(payload["neu"]).toBe(7);
  });
});

describe("isOwnEvent", () => {
  const eigener = "Senify Programm";

  it("erkennt das eigene Etikett", () => {
    expect(isOwnEvent({ actor: { label: eigener } }, eigener)).toBe(true);
  });

  it("erkennt ein fremdes Etikett", () => {
    expect(isOwnEvent({ actor: { label: "Agent" } }, eigener)).toBe(false);
  });

  it("wertet ein Ereignis ohne Actor nicht als eigenes", () => {
    // Ein fremder Schreiber ohne Etikett darf nicht als "meins" durchgehen -
    // sonst faellt seine Aenderung stillschweigend aus der Anzeige.
    expect(isOwnEvent({}, eigener)).toBe(false);
    expect(isOwnEvent({ actor: {} }, eigener)).toBe(false);
    expect(isOwnEvent({ actor: null }, eigener)).toBe(false);
    expect(isOwnEvent(null, eigener)).toBe(false);
  });

  it("vergleicht genau und nicht auf Teilstrings", () => {
    // "Senify Programm (alt)" ist ein anderer Schreiber.
    expect(isOwnEvent({ actor: { label: `${eigener} (alt)` } }, eigener)).toBe(false);
    expect(isOwnEvent({ actor: { label: "" } }, eigener)).toBe(false);
  });
});
