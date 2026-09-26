import { SenifyError } from "@senify/core";
import type { Theme } from "@senify/tokens";
import {
  deriveThemeDraft,
  materializeThemeDraft,
  verifyThemeRoundTrip,
  type ReferenceThemeDraft,
  type ThemeDraftVerification,
} from "./references-theme.ts";
import type { Store } from "./store.ts";
import type {
  EvidenceLevel,
  ReferenceGuardrailFinding,
  ReferenceProfile,
  ReferenceToken,
} from "./types.ts";

// design.md → Theme (E27): the documented tokens become a theme patch with the
// evidence of every single value ("kein Wert ohne Quelle"), the gaps of the
// document and the conflicts against the current theme. It is a read: the
// draft is written with update_theme, never here.

export type DesignSystemValue = {
  field: string;
  value: string;
  level: EvidenceLevel;
  // The Belegstelle: where the document states the value.
  source: string;
};

export type DesignSystemGap = {
  field: string;
  hint: string;
};

export type DesignSystemFont = {
  slot: "display" | "body";
  family: string;
  // true = known open font, false = known proprietary, null = unknown.
  open: boolean | null;
  suggestion: string | null;
};

export type DesignSystemConflict = {
  field: string;
  current: string;
  next: string;
};

export type DesignSystemImport = {
  reference: {
    id: string;
    name: string;
    sourceUrl: string;
    family: string | null;
    collection: string | null;
    reduced: boolean;
  };
  // Exactly the branches for update_theme.
  patch: {
    scales: ReferenceThemeDraft["scales"];
    fonts: ReferenceThemeDraft["fonts"];
    motion: ReferenceThemeDraft["motion"];
  };
  preview: {
    scales: Theme["scales"];
    displayFont: string;
    bodyFont: string;
    ease: Theme["motion"]["ease"];
    duration: Theme["motion"]["duration"];
  };
  // Every value with its evidence level and Belegstelle.
  evidence: DesignSystemValue[];
  // What the document does not cover; the scale engine keeps the current value.
  gaps: DesignSystemGap[];
  fonts: DesignSystemFont[];
  // Draft values that differ from the current theme.
  conflicts: DesignSystemConflict[];
  verification: ThemeDraftVerification;
  guardrails: ReferenceGuardrailFinding[];
  steps: string[];
};

// Families that are known to be open (SIL OFL / Apache / MIT) and can be
// self-hosted without a licence risk.
const OPEN_FONTS: ReadonlySet<string> = new Set([
  "inter",
  "sora",
  "fraunces",
  "space grotesk",
  "manrope",
  "dm sans",
  "dm serif display",
  "dm mono",
  "playfair display",
  "work sans",
  "ibm plex sans",
  "ibm plex serif",
  "ibm plex mono",
  "libre franklin",
  "public sans",
  "source sans 3",
  "source serif 4",
  "lora",
  "merriweather",
  "poppins",
  "montserrat",
  "raleway",
  "nunito",
  "open sans",
  "roboto",
  "barlow",
  "figtree",
  "outfit",
  "plus jakarta sans",
  "bricolage grotesque",
  "instrument sans",
  "instrument serif",
  "geist",
  "urbanist",
  "archivo",
  "anton",
  "syne",
  "unbounded",
  "karla",
  "mulish",
  "rubik",
  "epilogue",
  "red hat display",
  "red hat text",
  "space mono",
  "jetbrains mono",
  "fira sans",
  "ubuntu",
  "oswald",
  "caveat",
  "libre baskerville",
  "crimson text",
  "crimson pro",
  "bitter",
  "josefin sans",
  "quicksand",
  "comfortaa",
  "chivo",
  "albert sans",
  "be vietnam pro",
  "noto sans",
  "noto serif",
]);

// Known commercial faces mapped to an open alternative of a similar voice.
const PROPRIETARY_FONTS: Readonly<Record<string, string>> = {
  satoshi: "Inter",
  "general sans": "Inter",
  "cabinet grotesk": "Space Grotesk",
  "clash display": "Sora",
  "clash grotesk": "Space Grotesk",
  "pp neue montreal": "Inter",
  "neue montreal": "Inter",
  "pp neue haas grotesk": "Inter",
  "neue haas grotesk": "Inter",
  "gt america": "Inter",
  "gt walsheim": "Manrope",
  aeonik: "Inter",
  gilroy: "Manrope",
  "sofia pro": "Inter",
  circular: "Inter",
  graphik: "Inter",
  "suisse intl": "Inter",
  "suisse international": "Inter",
  "founders grotesk": "Space Grotesk",
  "editorial new": "Instrument Serif",
  "pp editorial new": "Instrument Serif",
  canela: "Fraunces",
  recoleta: "Fraunces",
  "ivypresto display": "Playfair Display",
  "forma dj": "Inter",
  "tt commons": "Inter",
  "untitled sans": "Inter",
  "basier circle": "Inter",
  matter: "Inter",
  "poly sans": "Inter",
  "helvetica now": "Inter",
  "sf pro display": "Inter",
};

const DEFAULT_OPEN_PAIR = "Inter (Body) + Sora (Display)";

function fontLookup(family: string): { open: boolean | null; suggestion: string | null } {
  const key = family.trim().toLowerCase().replace(/\s+/g, " ");
  if (key === "") return { open: null, suggestion: null };
  const candidates = [key, `${key} display`, `${key} text`, `${key} tight`];
  if (candidates.some((candidate) => OPEN_FONTS.has(candidate))) {
    return { open: true, suggestion: null };
  }
  const proprietary = PROPRIETARY_FONTS[key];
  if (proprietary !== undefined) {
    return {
      open: false,
      suggestion: `Lizenzpflichtig; offene Alternative: ${proprietary}.`,
    };
  }
  return {
    open: null,
    suggestion: `Lizenz prüfen; offene Alternative z. B. ${DEFAULT_OPEN_PAIR}.`,
  };
}

function tokenPool(profile: ReferenceProfile): ReferenceToken[] {
  return [
    ...profile.tokens.color,
    ...profile.tokens.families,
    ...profile.tokens.space,
    ...profile.tokens.radius,
    ...profile.tokens.shadow,
  ];
}

function valueEvidence(
  profile: ReferenceProfile,
  value: string,
): { level: EvidenceLevel; source: string } | null {
  const token = tokenPool(profile).find(
    (entry) => entry.value.toLowerCase() === value.toLowerCase(),
  );
  if (token === undefined) return null;
  return { level: token.level, source: token.where[0] ?? "profile" };
}

function sizeEvidence(
  profile: ReferenceProfile,
  value: string,
): { level: EvidenceLevel; source: string } | null {
  const px = Number.parseFloat(value);
  const step = profile.tokens.type.find(
    (entry) => Math.abs(Number.parseFloat(entry.size) - px) < 0.5,
  );
  if (step === undefined) return null;
  return { level: step.level, source: step.where[0] ?? "design.md#typography" };
}

function motionEvidence(
  profile: ReferenceProfile,
  value: string,
): { level: EvidenceLevel; source: string } | null {
  const recipe = profile.motion.find((entry) =>
    Object.values(entry.params).includes(value),
  );
  if (recipe === undefined) return null;
  return { level: recipe.level, source: recipe.where[0] ?? "design.md#motion" };
}

function familyEvidence(
  profile: ReferenceProfile,
  family: string,
  role: "display" | "body",
): { level: EvidenceLevel; source: string } | null {
  const token =
    profile.tokens.families.find((entry) => entry.role === role) ??
    profile.tokens.families.find(
      (entry) => entry.value.toLowerCase() === family.toLowerCase(),
    );
  if (token === undefined) return null;
  return { level: token.level, source: token.where[0] ?? "design.md#typography" };
}

export async function buildDesignSystemImport(
  store: Store,
  input: { referenceId: string; siteId: string },
): Promise<DesignSystemImport> {
  const reference = await store.getReference(input.referenceId);
  if (reference.profile === null) {
    throw new SenifyError(
      "conflict",
      `Referenz "${reference.name}" hat kein Profil`,
      {
        field: "referenceId",
        suggestion:
          "Referenz per analyze_reference analysieren oder mit Design.md importieren (Import-Lauf); beides erzeugt das Profil.",
      },
    );
  }
  const theme = await store.getTheme(input.siteId);
  const profile = reference.profile;
  const draft = deriveThemeDraft({
    assignments: [
      {
        referenceId: reference.id,
        name: reference.name,
        profile,
        scales: ["color", "type", "motion", "rest"],
      },
    ],
  });
  const verification = verifyThemeRoundTrip(draft, theme.theme);
  const merged = materializeThemeDraft(draft, theme.theme);

  // Every rationale entry gets its Belegstelle; fonts and computed values are
  // resolved separately (the scale engine derives them without a rationale).
  const evidence: DesignSystemValue[] = [];
  for (const entry of draft.rationale) {
    const found =
      entry.field === "scales.typeBase" || entry.field === "scales.typeRatio"
        ? sizeEvidence(profile, entry.value)
        : entry.field.startsWith("motion.")
          ? motionEvidence(profile, entry.value)
          : valueEvidence(profile, entry.value);
    evidence.push({
      field: entry.field,
      value: entry.value,
      level: found?.level ?? "inferred",
      source: found?.source ?? (entry.field.startsWith("motion.") ? "motion" : entry.source),
    });
  }
  for (const slot of ["display", "body"] as const) {
    const font = draft.fonts[slot];
    if (font === undefined) continue;
    const found = familyEvidence(profile, font.family, slot);
    evidence.push({
      field: `fonts.${slot}`,
      value: font.family,
      level: found?.level ?? "inferred",
      source: found?.source ?? "design.md#typography",
    });
  }

  // Gaps: roles the document does not cover. The scale engine keeps the
  // current theme value for them - named, never silent.
  const gapChecks: { field: string; present: boolean; hint: string }[] = [
    {
      field: "scales.brand",
      present: draft.scales.brand !== undefined,
      hint: "Keine Brand-Farbe im Dokument; design.md#Colors ergänzen oder Brand manuell setzen.",
    },
    {
      field: "scales.neutralBase",
      present: draft.scales.neutralBase !== undefined,
      hint: "Kein neutraler Ton gefunden; die neutrale Leiter bleibt unverändert.",
    },
    {
      field: "scales.typeBase",
      present: draft.scales.typeBase !== undefined,
      hint: "Keine Body-Größe im Dokument; design.md#Typography prüfen.",
    },
    {
      field: "scales.typeRatio",
      present: draft.scales.typeRatio !== undefined,
      hint: "Zu wenige Typo-Stufen für ein Verhältnis; die Skala bleibt unverändert.",
    },
    {
      field: "scales.spacingBase",
      present: draft.scales.spacingBase !== undefined,
      hint: "Keine Spacing-Einheit im Dokument („Base spacing unit“); Raster bleibt unverändert.",
    },
    {
      field: "scales.radiusBase",
      present: draft.scales.radiusBase !== undefined,
      hint: "Kein Radius im Dokument; design.md#Shape prüfen.",
    },
    {
      field: "fonts",
      present:
        draft.fonts.display !== undefined || draft.fonts.body !== undefined,
      hint: "Keine Font-Familie im Dokument; design.md#Typography prüfen.",
    },
    {
      field: "motion",
      present:
        Object.keys(draft.motion.ease ?? {}).length > 0 ||
        Object.keys(draft.motion.duration ?? {}).length > 0,
      hint: "Keine Motion-Werte im Dokument; das Motion-Profil bleibt unverändert.",
    },
  ];
  const gaps: DesignSystemGap[] = gapChecks
    .filter((check) => !check.present)
    .map((check) => ({ field: check.field, hint: check.hint }));

  const fonts: DesignSystemFont[] = [];
  for (const slot of ["display", "body"] as const) {
    const font = draft.fonts[slot];
    if (font === undefined) continue;
    fonts.push({ slot, family: font.family, ...fontLookup(font.family) });
  }

  // Conflicts: draft values that differ from the current theme. The scale
  // changes come from the round-trip verification; fonts and motion are
  // compared here.
  const conflicts: DesignSystemConflict[] = verification.changes.map((change) => ({
    field: change.field,
    current: change.from,
    next: change.to,
  }));
  for (const slot of ["display", "body"] as const) {
    const next = draft.fonts[slot]?.family;
    const current = theme.theme.fonts[slot].family;
    if (next !== undefined && next !== current) {
      conflicts.push({ field: `fonts.${slot}`, current, next });
    }
  }
  const nextEase = draft.motion.ease?.snappy;
  const currentEase = theme.theme.motion.ease.snappy;
  const currentEaseText =
    typeof currentEase === "string"
      ? currentEase
      : currentEase === undefined
        ? ""
        : JSON.stringify(currentEase);
  if (nextEase !== undefined && nextEase !== currentEaseText) {
    conflicts.push({
      field: "motion.ease.snappy",
      current: currentEaseText,
      next: nextEase,
    });
  }
  const nextDuration = draft.motion.duration?.base;
  const currentDuration = theme.theme.motion.duration.base ?? "";
  if (nextDuration !== undefined && nextDuration !== currentDuration) {
    conflicts.push({
      field: "motion.duration.base",
      current: currentDuration,
      next: nextDuration,
    });
  }

  // Reduced: a thin document or a profile that never measured at runtime.
  const reduced = profile.reduced || gaps.length >= 4;

  return {
    reference: {
      id: reference.id,
      name: reference.name,
      sourceUrl: reference.sourceUrl,
      family: reference.family ?? reference.families[0] ?? null,
      collection: reference.collection?.name ?? null,
      reduced,
    },
    patch: { scales: draft.scales, fonts: draft.fonts, motion: draft.motion },
    preview: {
      scales: { ...merged.scales },
      displayFont: merged.fonts.display.family,
      bodyFont: merged.fonts.body.family,
      ease: { ...merged.motion.ease },
      duration: { ...merged.motion.duration },
    },
    evidence,
    gaps,
    fonts,
    conflicts,
    verification,
    guardrails: profile.guardrails,
    steps: [
      "update_theme mit dem patch auf die Ziel-Site schreiben (nur die enthaltenen Zweige).",
      "create_preview und das Ergebnis in allen drei Breakpoints ansehen.",
      "Sektionen mit apply_mutations anpassen; get_reference_docs liefert die Details des Dokuments.",
      "submit_for_review; Publish bleibt beim Menschen.",
    ],
  };
}
