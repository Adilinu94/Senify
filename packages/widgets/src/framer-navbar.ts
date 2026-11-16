import type { WidgetMount } from "./contract.ts";
import { mountDomWidget } from "./dom-widget.ts";

export const mount: WidgetMount = (host, props) => {
  const onClick = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-wf-part="toggle"]');
    if (!(button instanceof HTMLElement) || !host.contains(button)) return;
    const open = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(open));
    const panel = host.querySelector('[data-wf-part="panel"]');
    if (panel instanceof HTMLElement) panel.hidden = !open;
  };
  host.addEventListener("click", onClick);
  const handle = mountDomWidget("framer-navbar", host, props);
  return {
    setProps: handle.setProps,
    destroy(): void {
      host.removeEventListener("click", onClick);
      handle.destroy();
    },
  };
};
