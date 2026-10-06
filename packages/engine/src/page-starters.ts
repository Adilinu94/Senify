import type { PropValue } from "@senify/section-sdk";

// Start templates for a new page ("Neue Seite" in the dashboard).
//
// A page used to start as an empty root: the first thing a person saw was a
// blank canvas and had to know which sections exist. A starter is a short list
// of sections with placeholder copy that reads as a placeholder — it names no
// company, number or contact detail, so nothing invented can go live by
// accident. The sections are ordinary registry sections: once the page exists
// they are edited, moved and deleted like any other.
//
// No navigation or footer: those come from the site layout.

export type PageStarterSection = {
  type: string;
  variant?: string;
  props: Record<string, PropValue>;
};

export type PageStarter = {
  id: "blank" | "landing" | "about" | "contact";
  label: string;
  description: string;
  // The title the page gets when the person types none.
  defaultTitle: string;
  sections: readonly PageStarterSection[];
};

export const PAGE_STARTERS: readonly PageStarter[] = [
  {
    id: "blank",
    label: "Leer",
    description: "Eine leere Seite — Sektionen fügen Sie selbst hinzu.",
    defaultTitle: "Neue Seite",
    sections: [],
  },
  {
    id: "landing",
    label: "Landingpage",
    description: "Hero, drei Vorteile und ein Aufruf zum Handeln.",
    defaultTitle: "Startseite",
    sections: [
      {
        type: "hero",
        variant: "centered",
        props: {
          eyebrow: "Willkommen",
          headline: "Ihre Überschrift",
          sub: "Ein Satz, der erklärt, was Besucher hier finden und warum es sich lohnt.",
        },
      },
      {
        type: "features",
        variant: "grid",
        props: {
          title: "Das bieten wir",
          intro: "Drei Stichpunkte, die Besucher überzeugen.",
          items: [
            { icon: "zap", title: "Erster Vorteil", text: "Ein bis zwei Sätze, die den Vorteil erklären." },
            { icon: "shield", title: "Zweiter Vorteil", text: "Ein bis zwei Sätze, die den Vorteil erklären." },
            { icon: "heart", title: "Dritter Vorteil", text: "Ein bis zwei Sätze, die den Vorteil erklären." },
          ],
        },
      },
      {
        type: "cta",
        variant: "simple",
        props: {
          headline: "Bereit für den nächsten Schritt?",
          sub: "Sagen Sie Besuchern, was als Nächstes passiert.",
        },
      },
    ],
  },
  {
    id: "about",
    label: "Über uns",
    description: "Ein Textabschnitt für Ihre Geschichte und drei Werte.",
    defaultTitle: "Über uns",
    sections: [
      {
        type: "content",
        variant: "prose",
        props: {
          title: "Über uns",
          intro: "Wer wir sind und wofür wir stehen.",
          body: "Erzählen Sie hier Ihre Geschichte: **Wer** sind Sie, **was** tun Sie und **warum**? Zwei bis drei kurze Absätze genügen.",
        },
      },
      {
        type: "features",
        variant: "list",
        props: {
          title: "Unsere Werte",
          items: [
            { icon: "heart", title: "Erster Wert", text: "Ein Satz dazu, was er für Ihre Kunden bedeutet." },
            { icon: "shield", title: "Zweiter Wert", text: "Ein Satz dazu, was er für Ihre Kunden bedeutet." },
            { icon: "zap", title: "Dritter Wert", text: "Ein Satz dazu, was er für Ihre Kunden bedeutet." },
          ],
        },
      },
    ],
  },
  {
    id: "contact",
    label: "Kontakt",
    description: "Ein Kontaktformular mit Einwilligungstext.",
    defaultTitle: "Kontakt",
    sections: [
      {
        type: "contact",
        variant: "split",
        props: {
          title: "Kontakt",
          intro: "Schreiben Sie uns — wir melden uns so schnell wie möglich.",
          fields: [
            { kind: "text", key: "name", label: "Name", required: true },
            { kind: "email", key: "email", label: "E-Mail", required: true },
            { kind: "textarea", key: "nachricht", label: "Ihre Nachricht", required: true },
          ],
          consentText: "Mit dem Absenden stimmen Sie unserer Datenschutzerklärung zu.",
        },
      },
    ],
  },
];

export const PAGE_STARTER_IDS = PAGE_STARTERS.map((starter) => starter.id);

export function pageStarterById(id: string): PageStarter | undefined {
  return PAGE_STARTERS.find((starter) => starter.id === id);
}
