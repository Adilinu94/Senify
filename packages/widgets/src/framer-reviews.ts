import type { WidgetMount } from "./contract.ts";
import { mountDomWidget } from "./dom-widget.ts";

export const mount: WidgetMount = (host, props) => mountDomWidget("framer-reviews", host, props);
