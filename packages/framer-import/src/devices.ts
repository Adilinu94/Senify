// Which Senify device a Framer width range belongs to.
//
// Framer sites define their own breakpoints (the usual 1200 / 810, but also
// 1440 / 810 as in the easier-train export, where `≥1440`, `810–1439.98` and
// `<810` are the three layouts). Senify has three devices at 1024 / 640. Range
// overlap cannot map one onto the other: `810–1439.98` overlaps both tablet and
// desktop, so two copies that are different layouts would both claim desktop.
//
// A device is instead represented by the width it is designed and measured at,
// and a range belongs to the devices whose width it CONTAINS. Each width lies
// inside the corresponding range of Senify AND of the common Framer setups
// (tablet: Senify 640–1023, Framer 810–1199; 900 is in both).
import type { IrDevice } from "./ir.ts";

export const REPRESENTATIVE_WIDTH: Readonly<Record<IrDevice, number>> = {
  desktop: 1440,
  tablet: 900,
  mobile: 390,
};

const ORDER: readonly IrDevice[] = ["desktop", "tablet", "mobile"];

export function devicesContaining(range: { minWidth: number | null; maxWidth: number | null }): IrDevice[] {
  const low = range.minWidth ?? 0;
  const high = range.maxWidth ?? Number.POSITIVE_INFINITY;
  return ORDER.filter((device) => REPRESENTATIVE_WIDTH[device] >= low && REPRESENTATIVE_WIDTH[device] <= high);
}
