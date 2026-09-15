import { Registry } from "@senify/core";
import { heroSection } from "./sections/hero.ts";

export { heroSection } from "./sections/hero.ts";

export const bundledSections = [heroSection];

export function createRegistry(): Registry {
  const registry = new Registry();
  for (const section of bundledSections) {
    registry.register(section);
  }
  return registry;
}
