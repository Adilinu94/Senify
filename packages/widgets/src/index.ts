export type { WidgetProps, WidgetHandle, WidgetMount } from "./contract.ts";
import type { WidgetMount } from "./contract.ts";
import { mount as ribbon } from "./ribbon-gallery.ts";
import { mount as wave } from "./wave-background.ts";
// Typ -> mount. Der Renderer bündelt je Typ das passende Modul; die Registry ist
// die Wahrheitsquelle der Typen.
export const WIDGET_MODULES: Record<string, WidgetMount> = {
  "ribbon-gallery": ribbon,
  "wave-background": wave,
};
