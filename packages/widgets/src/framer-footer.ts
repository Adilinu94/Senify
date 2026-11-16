import type { WidgetMount, WidgetProps } from "./contract.ts";
import { renderDomWidget } from "@senify/widget-engine/dom-widgets";

function validFormUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function loadForm(host: HTMLElement, props: WidgetProps): void {
  const slot = host.querySelector<HTMLElement>('[data-wf-part="form-slot"]');
  const card = host.querySelector<HTMLElement>('[data-wf-part="form-card"]');
  const src = validFormUrl(props["formUrl"]);
  if (slot === null || src === "") return;
  const frame = document.createElement("iframe");
  frame.className = "w-framer-footer__iframe";
  frame.src = src;
  frame.title =
    typeof props["formTitle"] === "string" && props["formTitle"].trim() !== ""
      ? props["formTitle"]
      : "Anfrageformular";
  frame.loading = "lazy";
  frame.allow = "clipboard-write";
  slot.replaceChildren(frame);
  card?.setAttribute("data-loaded", "true");
}

export const mount: WidgetMount = (host, props) => {
  let current = props;
  let granted = false;
  const render = (): void => {
    host.innerHTML = renderDomWidget("framer-footer", current);
    if (granted) loadForm(host, current);
  };
  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trigger = target.closest('[data-wf-part="form-load"]');
    if (trigger === null || !host.contains(trigger)) return;
    granted = true;
    render();
  };
  host.addEventListener("click", onClick);
  render();
  return {
    setProps(next) {
      current = next;
      render();
    },
    destroy() {
      host.removeEventListener("click", onClick);
    },
  };
};
