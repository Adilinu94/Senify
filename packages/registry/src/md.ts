import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderMarkdown(source: string): string {
  const raw = marked.parse(source, { breaks: true }) as string;
  return sanitizeHtml(raw, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "title", "target", "rel"],
      img: ["src", "srcset", "alt", "title", "width", "height", "loading"],
    },
  });
}
