// DOM-Widgets: Framer-Komponenten, deren Inneres die Projekt-XML nicht
// mitliefert (Navbar, Footer, Step 2, Ticker reviews item). Der Kern ist ein
// reiner HTML-Renderer: dasselbe Ergebnis steht als Server-Markup im Host (der
// Bake und der Design-Canvas zeigen es ohne JavaScript) und wird beim Mount
// erneut in den Host geschrieben. Die Interaktion (Mobilmenü) hängt der Kern
// als Ereignis an den Host, nicht an einzelne Knoten.
//
// Alles, was aus Props kommt, wird escaped; Links laufen durch `isSafeHref`,
// Bilder nur über http(s) oder relative Adressen. Der Renderer ist damit auch
// für importierte Texte aus einer fremden Quelle sicher.

import type { PropValue } from "./types.ts";
import { isSafeHref } from "./inline-html.ts";

type Props = Readonly<Record<string, unknown>>;
type Entry = Record<string, unknown>;

const STRUCTURAL_PROPS = new Set([
  "nodeId",
  "componentId",
  "variant",
  "name",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "top",
  "left",
  "right",
  "bottom",
  "position",
  "zIndex",
  "overflow",
  "opacity",
  "layout",
  "gap",
  "padding",
  "margin",
  "stackDirection",
  "stackDistribution",
  "stackAlignment",
  "gridColumns",
  "gridRows",
  "gridColumnSpan",
  "gridRowSpan",
  "gridColumnWidth",
  "gridColumnMinWidth",
  "gridRowHeight",
  "gridFillHeight",
  "gridAlignX",
  "gridAlignY",
  "backgroundColor",
  "borderRadius",
  "border",
  "boxShadow",
  "font",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlignment",
  "textColor",
  "inlineTextStyle",
  "link",
  "href",
  "target",
  "linkOpenInNewTab",
  "className",
  "id",
  "style",
]);

function isRecord(value: unknown): value is Entry {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function entries(value: unknown): Entry[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function href(value: unknown, fallback = "#"): string {
  const target = str(value).trim();
  return target !== "" && isSafeHref(target) ? target : fallback;
}

function external(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function linkAttrs(value: unknown): string {
  const target = href(value);
  return external(target) ? ` target="_blank" rel="noopener noreferrer"` : "";
}

function image(value: unknown): { src: string; asset: string } {
  if (typeof value === "string") {
    const candidate = value.trim();
    if (candidate === "") return { src: "", asset: "" };
    const externalUrl = /^https?:/i.test(candidate) || candidate.startsWith("//");
    const localUrl = candidate.startsWith("/") || candidate.startsWith("./") || candidate.startsWith("../");
    if (isSafeHref(candidate) && (externalUrl || localUrl)) return { src: candidate, asset: "" };
    return { src: "", asset: candidate };
  }
  if (isRecord(value)) {
    const src = str(value["src"]) || str(value["url"]);
    if (src !== "" && isSafeHref(src)) return { src, asset: "" };
    const asset = str(value["assetId"]);
    if (asset !== "") return { src: "", asset };
  }
  return { src: "", asset: "" };
}

function img(value: unknown, className: string, alt: string): string {
  const found = image(value);
  if (found.src !== "") {
    return `<img class="${esc(className)}" src="${esc(found.src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  }
  if (found.asset !== "") {
    return `<img class="${esc(className)}" data-asset="${esc(found.asset)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  }
  return "";
}

function initials(value: string): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.charAt(0) ?? "?") + (words.length > 1 ? words[words.length - 1]?.charAt(0) ?? "" : "");
}

function socialIcon(name: string): string {
  const icon = name.toLowerCase();
  if (icon === "instagram") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>`;
  }
  if (icon === "whatsapp") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.7 8.3c.2-.5.4-.5.7-.5h.5c.2 0 .3.1.5.4l.6 1.4c.1.3 0 .5-.1.6l-.4.5c-.1.2-.2.3 0 .6.4.7 1.2 1.6 2.2 2.1.3.1.4.1.6-.1l.5-.6c.2-.2.3-.2.6-.1l1.4.7c.2.1.4.2.4.4 0 .2-.1 1-.6 1.4-.5.4-1.2.6-1.9.4-1-.3-2.4-1-3.5-2.1-1-1-1.8-2.3-2-3.3-.2-.8 0-1.4.4-1.8Z" fill="currentColor"/></svg>`;
  }
  if (icon === "mail") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}

function toneClass(base: string, props: Props): string {
  return `${base}${str(props["tone"]) === "light" ? " ${base}--light" : ""}`;
}

/* ------------------------------------------------------------- navbar */

function navbar(props: Props): string {
  const brand = str(props["brand"], "NICK WEBDESIGN");
  const home = href(props["home"], "/");
  const logo = img(props["logo"], "w-framer-navbar__logo", brand);
  const links = entries(props["links"])
    .map((item) => {
      const label = str(item["label"]);
      if (label === "") return "";
      return `<a class="w-framer-navbar__link" data-wf-part="link" href="${esc(href(item["link"]))}"${linkAttrs(item["link"])}>${esc(label)}</a>`;
    })
    .join("");
  const email = str(props["email"]);
  const emailLabel = str(props["emailLabel"], "Email:");
  const emailLink =
    email === ""
      ? ""
      : `<p class="w-framer-navbar__email"><span>${esc(emailLabel)}</span> <a href="mailto:${esc(email)}">${esc(email)}</a></p>`;
  const ctaLabel = str(props["ctaLabel"]);
  const ctaLink = str(props["ctaLink"]);
  const cta =
    ctaLabel === "" || ctaLink === ""
      ? ""
      : `<a class="w-framer-navbar__cta" data-wf-part="cta" href="${esc(href(ctaLink))}"${linkAttrs(ctaLink)}>${esc(ctaLabel)}</a>`;
  const panelLinks = entries(props["links"])
    .map((item) => {
      const label = str(item["label"]);
      if (label === "") return "";
      return `<a href="${esc(href(item["link"]))}"${linkAttrs(item["link"])}>${esc(label)}</a>`;
    })
    .join("");
  const solid = str(props["appearance"]) === "solid";
  const sticky = flag(props["sticky"], false);
  return `<div class="${esc(toneClass("w-framer-navbar__root", props))}" data-sticky="${sticky}" data-appearance="${solid ? "solid" : "transparent"}">
  <header class="w-framer-navbar__inner">
    <a class="w-framer-navbar__brand" data-wf-part="brand" href="${esc(home)}">
      ${logo}
      <span>${esc(brand)}</span>
    </a>
    <nav class="w-framer-navbar__menu" data-wf-part="menu" aria-label="Hauptnavigation">${links}</nav>
    <div class="w-framer-navbar__right">
      ${emailLink}
      ${cta}
      <button class="w-framer-navbar__toggle" data-wf-part="toggle" type="button" aria-expanded="false">Menü</button>
    </div>
  </header>
  <div class="w-framer-navbar__panel" data-wf-part="panel" hidden>
    <nav aria-label="Mobile Navigation">${panelLinks}</nav>
    ${emailLink}
  </div>
</div>`;
}

/* ------------------------------------------------------------- footer */

function footer(props: Props): string {
  const headline = str(props["headline"], "Bereit für deine neue Website?");
  const subline = str(props["subline"]);
  const formTitle = str(props["formTitle"], "Projekt anfragen");
  const formText = str(props["formText"]);
  const formLabel = str(props["formLabel"], "Formular öffnen");
  const formUrl = str(props["formUrl"]);
  const form =
    formUrl === ""
      ? ""
      : `<a class="w-framer-footer__form-button" data-wf-part="form" href="${esc(href(formUrl))}"${linkAttrs(formUrl)}>${esc(formLabel)}</a>`;
  const authorName = str(props["authorName"]);
  const authorRole = str(props["authorRole"]);
  const avatar =
    img(props["avatar"], "w-framer-footer__avatar", authorName) ||
    `<span class="w-framer-footer__avatar w-framer-footer__avatar--fallback" aria-hidden="true">${esc(initials(authorName))}</span>`;
  const contactLabel = str(props["contactLabel"], "Schreib mir");
  const email = str(props["email"]);
  const note = str(props["note"]);
  const social = entries(props["social"])
    .map((item) => {
      const label = str(item["label"]);
      if (label === "") return "";
      return `<a class="w-framer-footer__social-link" data-wf-part="social" href="${esc(href(item["link"]))}"${linkAttrs(item["link"])} aria-label="${esc(label)}" title="${esc(label)}">${socialIcon(str(item["icon"], label))}</a>`;
    })
    .join("");
  const legalLinks = entries(props["legalLinks"])
    .map((item) => {
      const label = str(item["label"]);
      if (label === "") return "";
      return `<a href="${esc(href(item["link"]))}"${linkAttrs(item["link"])}>${esc(label)}</a>`;
    })
    .join("");
  const logo = img(props["logo"], "w-framer-footer__logo-image", str(props["footerBrand"], "Nick Webdesign"));
  const brand = str(props["footerBrand"], "Nick Webdesign");
  return `<div class="${esc(toneClass("w-framer-footer__root", props))}">
  <div class="w-framer-footer__inner">
    <div class="w-framer-footer__cta">
      <h2 data-wf-part="headline">${esc(headline)}</h2>
      ${subline === "" ? "" : `<p>${esc(subline)}</p>`}
    </div>
    <div class="w-framer-footer__body">
      <div class="w-framer-footer__form">
        <p class="w-framer-footer__form-kicker">${esc(formTitle)}</p>
        ${formText === "" ? "" : `<p class="w-framer-footer__form-text">${esc(formText)}</p>`}
        ${form}
      </div>
      <aside class="w-framer-footer__info">
        <div class="w-framer-footer__author" data-wf-part="author">
          ${avatar}
          <div>
            <strong>${esc(authorName)}</strong>
            <span>${esc(authorRole)}</span>
          </div>
        </div>
        <div class="w-framer-footer__contact">
          <p class="w-framer-footer__label">${esc(contactLabel)}</p>
          ${email === "" ? "" : `<a class="w-framer-footer__email" data-wf-part="email" href="mailto:${esc(email)}">${esc(email)}</a>`}
        </div>
        ${note === "" ? "" : `<p class="w-framer-footer__note">${esc(note)}</p>`}
        ${social === "" ? "" : `<div class="w-framer-footer__social" data-wf-part="social">${social}</div>`}
      </aside>
    </div>
  </div>
  <div class="w-framer-footer__bottom">
    <a class="w-framer-footer__brand" href="/">${logo}<span>${esc(brand)}</span></a>
    <p class="w-framer-footer__legal">${esc(str(props["legal"]))}</p>
    <nav class="w-framer-footer__legal-links" aria-label="Rechtliches">${legalLinks}</nav>
  </div>
</div>`;
}

/* ------------------------------------------------------------- reviews */

function stars(rating: number): string {
  const full = Math.floor(Math.max(0, Math.min(5, rating)));
  const remainder = Math.max(0, Math.min(5, rating)) - full;
  const filled = remainder >= 0.75 ? full + 1 : full;
  const half = remainder >= 0.25 && remainder < 0.75;
  return Array.from({ length: 5 }, (_, index) => {
    const on = index < filled;
    const halfOn = index === filled && half;
    return `<span${on ? ' data-on="true"' : ""}${halfOn ? ' data-half="true"' : ""}>★</span>`;
  }).join("");
}

function reviewCard(item: Entry): string {
  const ratingText = str(item["rating"], "5").replace(",", ".");
  const parsed = Number(ratingText);
  const rating = Number.isFinite(parsed) ? parsed : 5;
  const author = str(item["author"]);
  const quote = str(item["quote"]);
  const avatar =
    img(item["avatar"], "w-framer-reviews__avatar", author) ||
    `<span class="w-framer-reviews__avatar w-framer-reviews__avatar--fallback" aria-hidden="true">${esc(initials(author))}</span>`;
  return `<article class="w-framer-reviews__card" data-wf-part="review">
  <div class="w-framer-reviews__top">
    <div class="w-framer-reviews__rating"><strong>${esc(ratingText)}</strong><span>/ 5</span></div>
    <div class="w-framer-reviews__stars" aria-label="${esc(ratingText)} von 5">${stars(rating)}</div>
    <span class="w-framer-reviews__quote-mark" aria-hidden="true">”</span>
  </div>
  <p class="w-framer-reviews__quote">${esc(quote)}</p>
  <div class="w-framer-reviews__author">${avatar}<span>${esc(author)}</span></div>
</article>`;
}

function reviews(props: Props): string {
  const items = entries(props["items"]);
  const cards = items.map(reviewCard).join("");
  if (cards === "") return `<div class="${esc(toneClass("w-framer-reviews__root", props))}"></div>`;
  const speed = Math.max(4, num(props["speed"], 40));
  const pause = flag(props["pause"], true);
  const group = `<div class="w-framer-reviews__group">${cards}</div>`;
  return `<div class="${esc(toneClass("w-framer-reviews__root", props))}" style="--wfr-duration:${speed}s">
  <div class="w-framer-reviews__viewport" data-pause="${pause}">
    <div class="w-framer-reviews__track" data-wf-part="track">
      ${group}
      <div class="w-framer-reviews__group" aria-hidden="true">${cards}</div>
    </div>
  </div>
</div>`;
}

/* --------------------------------------------------------------- step */

function step(props: Props): string {
  const nr = str(props["nr"], "01");
  const title = str(props["title"], "Webdesign");
  const text = str(props["text"]);
  const points = entries(props["points"])
    .map((point) => {
      const label = str(point["label"]);
      const detail = str(point["text"]);
      if (label === "" && detail === "") return "";
      return `<li class="w-framer-step__point"><strong>${esc(label)}</strong>${detail === "" ? "" : `<span>${esc(detail)}</span>`}</li>`;
    })
    .join("");
  return `<div class="${esc(toneClass("w-framer-step__root", props))}">
  <article class="w-framer-step__card" data-wf-part="card">
    <div class="w-framer-step__left"><span class="w-framer-step__tag" data-wf-part="tag">${esc(title)}</span></div>
    <div class="w-framer-step__content">
      <p class="w-framer-step__nr" data-wf-part="nr"><span>/</span> ${esc(nr)}</p>
      <div class="w-framer-step__body">
        <h3 class="w-framer-step__title">${esc(text)}</h3>
        ${points === "" ? "" : `<ul class="w-framer-step__points">${points}</ul>`}
      </div>
    </div>
    <div class="w-framer-step__right" aria-hidden="true"></div>
  </article>
</div>`;
}

/* ---------------------------------------------------------- public API */

export const DOM_WIDGET_TYPES = ["framer-navbar", "framer-footer", "framer-reviews", "framer-step"] as const;
export type DomWidgetType = (typeof DOM_WIDGET_TYPES)[number];

export function isDomWidgetType(type: string): type is DomWidgetType {
  return (DOM_WIDGET_TYPES as readonly string[]).includes(type);
}

export function renderDomWidget(type: string, props: Readonly<Record<string, PropValue>> | Props): string {
  switch (type) {
    case "framer-navbar":
      return navbar(props as Props);
    case "framer-footer":
      return footer(props as Props);
    case "framer-reviews":
      return reviews(props as Props);
    case "framer-step":
      return step(props as Props);
    default:
      return "";
  }
}

// Die Komponenten-Props eines Framer-<Step2>-Instanzknotens: Die ersten drei
// nicht-strukturellen Werte sind Nummer, Titel und Beschreibung, danach folgen
// Label/Text-Paare. Die Reihenfolge ist die Reihenfolge der Attribute in der
// Projekt-XML (gemessen an fluffy-rectangle-418998, 15.11.2026).
export function stepWidgetProps(attrs: Readonly<Record<string, string>>): Record<string, PropValue> {
  const values = Object.entries(attrs)
    .filter(([key, value]) => !STRUCTURAL_PROPS.has(key) && value.trim() !== "")
    .map(([, value]) => value.trim());
  if (values.length < 3) return {};
  const [nr, title, text, ...rest] = values as [string, string, string, ...string[]];
  const points: { label: string; text: string }[] = [];
  for (let index = 0; index + 1 < rest.length; index += 2) {
    points.push({ label: rest[index] ?? "", text: rest[index + 1] ?? "" });
  }
  return { nr, title, text, points };
}

export const DOM_WIDGET_CSS = `
.w-framer-navbar__root,
.w-framer-footer__root,
.w-framer-reviews__root,
.w-framer-step__root {
  --wf-fg: #ffffff;
  --wf-muted: rgba(255, 255, 255, 0.6);
  --wf-faint: rgba(255, 255, 255, 0.5);
  --wf-line: rgba(255, 255, 255, 0.1);
  --wf-card: #121212;
  --wf-bg: #111111;
  --wf-accent: #d7ff6f;
  --wf-accent-ink: #111111;
  color: var(--wf-fg);
  font-family: inherit;
}
.w-framer-navbar__root--light,
.w-framer-footer__root--light,
.w-framer-reviews__root--light,
.w-framer-step__root--light {
  --wf-fg: #111111;
  --wf-muted: rgba(17, 17, 17, 0.6);
  --wf-faint: rgba(17, 17, 17, 0.55);
  --wf-line: rgba(17, 17, 17, 0.12);
  --wf-card: #f4f4f4;
  --wf-bg: #ffffff;
  --wf-accent: #8cff2e;
  --wf-accent-ink: #111111;
}
.w-framer-navbar__root,
.w-framer-footer__root,
.w-framer-reviews__root,
.w-framer-step__root,
.w-framer-navbar__root *,
.w-framer-footer__root *,
.w-framer-reviews__root *,
.w-framer-step__root * {
  box-sizing: border-box;
}

/* Navigation */
.w-framer-navbar__root { width: 100%; position: relative; z-index: 20; }
.w-framer-navbar:has(> .w-framer-navbar__root[data-sticky="true"]) { position: sticky; top: 0; z-index: 30; }
.w-framer-navbar__root[data-appearance="solid"] { background: color-mix(in srgb, var(--wf-bg) 88%, transparent); backdrop-filter: blur(14px); }
.w-framer-navbar__inner { display: flex; align-items: center; justify-content: space-between; gap: 32px; width: 100%; max-width: 1440px; margin: 0 auto; padding: 30px 40px; border-bottom: 1px solid var(--wf-line); }
.w-framer-navbar__brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; font-size: 24px; font-weight: 600; letter-spacing: -0.04em; line-height: 1.3; }
.w-framer-navbar__logo { display: block; width: 41px; height: 30px; object-fit: contain; border-radius: 6px; }
.w-framer-navbar__menu { display: flex; align-items: center; gap: 38px; }
.w-framer-navbar__link { color: inherit; text-decoration: none; font-size: 16px; font-weight: 600; line-height: 20px; }
.w-framer-navbar__link:hover { color: var(--wf-accent); }
.w-framer-navbar__right { display: flex; align-items: center; gap: 33px; }
.w-framer-navbar__email { margin: 0; display: flex; align-items: center; gap: 5px; font-size: 15px; font-weight: 600; line-height: 1.4; }
.w-framer-navbar__email span { color: var(--wf-muted); font-weight: 400; }
.w-framer-navbar__email a { color: inherit; text-decoration: none; }
.w-framer-navbar__email a:hover { color: var(--wf-accent); }
.w-framer-navbar__cta { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 16px 24px; border-radius: 30px; background: rgba(255, 255, 255, 0.22); color: var(--wf-fg); font-size: 15px; font-weight: 600; line-height: 14px; text-decoration: none; }
.w-framer-navbar__root--light .w-framer-navbar__cta { background: rgba(17, 17, 17, 0.08); }
.w-framer-navbar__cta:hover { background: var(--wf-accent); color: var(--wf-accent-ink); }
.w-framer-navbar__toggle { display: none; border: 1px solid var(--wf-line); border-radius: 999px; background: transparent; color: inherit; font: inherit; font-size: 15px; font-weight: 600; padding: 10px 16px; cursor: pointer; }
.w-framer-navbar__panel { display: none; padding: 16px 40px 24px; border-bottom: 1px solid var(--wf-line); background: color-mix(in srgb, var(--wf-bg) 94%, transparent); backdrop-filter: blur(14px); }
.w-framer-navbar__panel[hidden] { display: none; }
.w-framer-navbar__panel nav { display: flex; flex-direction: column; gap: 12px; }
.w-framer-navbar__panel a { color: inherit; text-decoration: none; font-size: 17px; font-weight: 600; }
.w-framer-navbar__panel .w-framer-navbar__email { margin-top: 12px; }

/* Footer */
.w-framer-footer__root { width: 100%; background: var(--wf-bg); }
.w-framer-footer__inner { width: 100%; max-width: 1440px; margin: 0 auto; padding: 160px 40px; display: flex; flex-direction: column; gap: 80px; }
.w-framer-footer__cta h2 { margin: 0; font-size: clamp(3rem, 7vw, 6rem); line-height: 1; font-weight: 400; letter-spacing: -0.05em; }
.w-framer-footer__cta p { margin: 60px 0 0; max-width: 1320px; font-size: 22px; line-height: 1.4; font-weight: 600; letter-spacing: -0.04em; color: var(--wf-muted); white-space: pre-line; }
.w-framer-footer__body { display: grid; grid-template-columns: minmax(0, 860px) minmax(0, 400px); gap: 60px; align-items: start; }
.w-framer-footer__form { min-height: 500px; padding: 40px; border: 1px solid var(--wf-line); border-radius: 20px; background: var(--wf-card); display: flex; flex-direction: column; justify-content: center; gap: 16px; }
.w-framer-footer__form-kicker { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--wf-accent); }
.w-framer-footer__form-text { margin: 0; max-width: 520px; font-size: 20px; line-height: 1.4; color: var(--wf-muted); }
.w-framer-footer__form-button { align-self: flex-start; display: inline-flex; align-items: center; justify-content: center; margin-top: 16px; padding: 16px 28px; border-radius: 999px; background: var(--wf-accent); color: var(--wf-accent-ink); font-size: 16px; font-weight: 700; text-decoration: none; }
.w-framer-footer__form-button:hover { filter: brightness(1.06); }
.w-framer-footer__info { display: flex; flex-direction: column; gap: 40px; padding-top: 40px; }
.w-framer-footer__author { display: flex; align-items: center; gap: 26px; }
.w-framer-footer__author div { display: flex; flex-direction: column; gap: 4px; }
.w-framer-footer__author strong { font-size: 20px; font-weight: 600; }
.w-framer-footer__author span { font-size: 15px; color: var(--wf-muted); }
.w-framer-footer__avatar { display: inline-flex; align-items: center; justify-content: center; width: 90px; height: 90px; border-radius: 50%; object-fit: cover; background: var(--wf-card); border: 1px solid var(--wf-line); font-size: 26px; font-weight: 600; }
.w-framer-footer__email { display: block; font-size: 34px; line-height: 1.15; font-weight: 600; letter-spacing: -0.04em; color: inherit; text-decoration: none; overflow-wrap: anywhere; }
.w-framer-footer__email:hover { color: var(--wf-accent); }
.w-framer-footer__label { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: var(--wf-muted); }
.w-framer-footer__note { margin: 0; font-size: 19px; line-height: 1.4; color: var(--wf-faint); }
.w-framer-footer__social { display: flex; align-items: center; gap: 10px; }
.w-framer-footer__social-link { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; color: var(--wf-fg); }
.w-framer-footer__social-link svg { width: 22px; height: 22px; }
.w-framer-footer__social-link:hover { color: var(--wf-accent); }
.w-framer-footer__bottom { width: 100%; max-width: 1440px; margin: 0 auto; padding: 60px 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-top: 1px solid var(--wf-line); }
.w-framer-footer__brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; font-size: 24px; font-weight: 600; letter-spacing: -0.04em; }
.w-framer-footer__logo-image { display: block; width: 46px; height: 46px; border-radius: 50%; object-fit: cover; }
.w-framer-footer__legal { margin: 0; font-size: 15px; line-height: 1.3; color: var(--wf-muted); }
.w-framer-footer__legal-links { display: flex; align-items: center; gap: 24px; }
.w-framer-footer__legal-links a { color: inherit; text-decoration: none; font-size: 15px; font-weight: 600; }
.w-framer-footer__legal-links a:hover { color: var(--wf-accent); }

/* Review-Ticker */
.w-framer-reviews__root { width: 100%; overflow: hidden; }
.w-framer-reviews__viewport { width: 100%; overflow: hidden; }
.w-framer-reviews__track { display: flex; width: max-content; animation: w-framer-reviews-scroll var(--wfr-duration, 40s) linear infinite; }
.w-framer-reviews__viewport[data-pause="true"]:hover .w-framer-reviews__track { animation-play-state: paused; }
.w-framer-reviews__group { display: flex; gap: 30px; padding-right: 30px; flex: none; }
.w-framer-reviews__card { width: 423px; height: 530px; padding: 38px; border: 1px solid var(--wf-line); border-radius: 14px; background: var(--wf-card); display: flex; flex-direction: column; gap: 24px; }
.w-framer-reviews__top { display: flex; align-items: center; gap: 16px; }
.w-framer-reviews__rating { display: flex; align-items: baseline; gap: 6px; font-size: 20px; font-weight: 600; }
.w-framer-reviews__rating span { color: var(--wf-muted); font-size: 15px; }
.w-framer-reviews__stars { display: inline-flex; gap: 2px; color: rgba(255, 255, 255, 0.22); font-size: 15px; line-height: 1; }
.w-framer-reviews__stars span[data-on="true"] { color: var(--wf-fg); }
.w-framer-reviews__stars span[data-half="true"] { color: var(--wf-fg); opacity: 0.5; }
.w-framer-reviews__quote-mark { margin-left: auto; color: var(--wf-accent); font-size: 44px; line-height: 0.7; }
.w-framer-reviews__quote { margin: 0; flex: 1; font-size: 20px; line-height: 1.45; color: var(--wf-muted); }
.w-framer-reviews__author { display: flex; align-items: center; gap: 14px; font-size: 16px; font-weight: 600; }
.w-framer-reviews__avatar { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 46px; border-radius: 50%; object-fit: cover; background: var(--wf-bg); border: 1px solid var(--wf-line); font-size: 15px; font-weight: 600; }
@keyframes w-framer-reviews-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

/* Prozess-Schritt */
.w-framer-step__root { width: 100%; }
.w-framer-step__card { display: grid; grid-template-columns: 220px minmax(0, 880px) 220px; align-items: start; gap: 0; padding: 60px 0; border-top: 1px solid var(--wf-line); }
.w-framer-step__left { display: flex; align-items: flex-start; }
.w-framer-step__tag { display: inline-flex; align-items: center; justify-content: center; min-height: 40px; padding: 8px 20px; border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 27px; font-size: 15px; font-weight: 600; line-height: 1.2; }
.w-framer-step__root--light .w-framer-step__tag { border-color: rgba(17, 17, 17, 0.2); }
.w-framer-step__content { display: grid; grid-template-columns: 115px minmax(0, 1fr); gap: 56px; align-items: start; padding-right: 56px; }
.w-framer-step__body { display: flex; flex-direction: column; gap: 12px; }
.w-framer-step__nr { margin: 0; font-size: 36px; line-height: 1; font-weight: 600; letter-spacing: -0.04em; }
.w-framer-step__nr span { color: var(--wf-accent); }
.w-framer-step__title { margin: 0; font-size: 24px; line-height: 1.3; font-weight: 600; letter-spacing: -0.04em; }
.w-framer-step__points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.w-framer-step__point { display: flex; flex-direction: column; gap: 2px; font-size: 17px; line-height: 1.35; }
.w-framer-step__point strong { font-weight: 600; }
.w-framer-step__point span { color: var(--wf-faint); }
.w-framer-step__right { min-height: 1px; }

@media (max-width: 1100px) {
  .w-framer-footer__body { grid-template-columns: minmax(0, 1fr); }
  .w-framer-footer__inner { padding-top: 100px; }
  .w-framer-step__card { grid-template-columns: 160px minmax(0, 1fr); }
  .w-framer-step__right { display: none; }
}
@media (max-width: 900px) {
  .w-framer-navbar__inner { padding: 20px 24px; gap: 16px; }
  .w-framer-navbar__menu,
  .w-framer-navbar__right .w-framer-navbar__email,
  .w-framer-navbar__right .w-framer-navbar__cta { display: none; }
  .w-framer-navbar__toggle { display: inline-flex; }
  .w-framer-navbar__panel:not([hidden]) { display: block; }
  .w-framer-footer__inner { padding: 80px 24px; gap: 56px; }
  .w-framer-footer__cta p { margin-top: 32px; font-size: 19px; }
  .w-framer-footer__form { min-height: 0; padding: 28px; }
  .w-framer-footer__email { font-size: 26px; }
  .w-framer-footer__bottom { flex-direction: column; align-items: flex-start; padding: 40px 24px; }
  .w-framer-step__card { grid-template-columns: minmax(0, 1fr); gap: 24px; padding: 40px 0; }
  .w-framer-step__content { grid-template-columns: minmax(0, 1fr); gap: 16px; padding-right: 0; }
  .w-framer-reviews__card { width: min(82vw, 423px); height: auto; min-height: 420px; padding: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  .w-framer-reviews__track { animation: none; }
  .w-framer-reviews__viewport { overflow-x: auto; }
}
`;
