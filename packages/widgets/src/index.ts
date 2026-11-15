export type { WidgetProps, WidgetHandle, WidgetMount } from "./contract.ts";
import type { WidgetMount } from "./contract.ts";
import { mount as footer } from "./framer-footer.ts";
import { mount as navbar } from "./framer-navbar.ts";
import { mount as reviews } from "./framer-reviews.ts";
import { mount as step } from "./framer-step.ts";
import { mount as ribbon } from "./ribbon-gallery.ts";
import { mount as wave } from "./wave-background.ts";
// Typ -> mount. Der Renderer bündelt je Typ das passende Modul; die Registry ist
// die Wahrheitsquelle der Typen.
export const WIDGET_MODULES: Record<string, WidgetMount> = {
  "ribbon-gallery": ribbon,
  "wave-background": wave,
  "framer-navbar": navbar,
  "framer-footer": footer,
  "framer-reviews": reviews,
  "framer-step": step,
};
