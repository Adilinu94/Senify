// Gemeinsamer Kern der DOM-Widgets (ADR-0038): Der Markup-Serializer und der
// Kern lesen denselben Renderer. Beim Mount schreibt der Kern das HTML erneut
// in den Host und hängt danach die Interaktion an; bei `setProps` wird nur neu
// gerendert. Kein React, kein Framer, kein WebGL.

import { renderDomWidget } from "@senify/widget-engine/dom-widgets";
import type { WidgetHandle, WidgetProps } from "./contract.ts";

export function mountDomWidget(
  type: string,
  host: HTMLElement,
  props: WidgetProps,
  bind?: (host: HTMLElement) => void,
): WidgetHandle {
  let current = props;
  const render = (): void => {
    host.innerHTML = renderDomWidget(type, current);
  };
  render();
  bind?.(host);
  return {
    setProps(next: WidgetProps): void {
      current = next;
      render();
    },
    destroy(): void {
      // Der Inhalt bleibt stehen (der Host wird beim Entfernen ohnehin aus dem
      // Dokument genommen); nur eigene Listener gehören dem Aufrufer.
    },
  };
}
