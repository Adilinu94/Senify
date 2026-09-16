import type { PropValue } from "./types.ts";

// Device model: a value lives in the base prop (`paddingY`) and can be
// overridden per device through the `_tablet` / `_mobile` suffixes. Devices
// inherit from top to bottom — mobile falls back to tablet, tablet to desktop.
// Resetting a device override removes only the suffix key, so the value
// inherits again.

export type Device = "desktop" | "tablet" | "mobile";

export const DEVICES: readonly Device[] = ["desktop", "tablet", "mobile"];

export const TABLET_SUFFIX = "_tablet";
export const MOBILE_SUFFIX = "_mobile";

export const DEVICE_SUFFIX: Record<Device, string> = {
  desktop: "",
  tablet: TABLET_SUFFIX,
  mobile: MOBILE_SUFFIX,
};

export type DeviceValueMap = Record<string, PropValue>;

export function deviceKey(baseKey: string, device: Device): string {
  return baseKey + DEVICE_SUFFIX[device];
}

export function isDeviceKey(key: string): boolean {
  return key.endsWith(TABLET_SUFFIX) || key.endsWith(MOBILE_SUFFIX);
}

export function baseKeyOf(key: string): string {
  if (key.endsWith(TABLET_SUFFIX)) {
    return key.slice(0, -TABLET_SUFFIX.length);
  }
  if (key.endsWith(MOBILE_SUFFIX)) {
    return key.slice(0, -MOBILE_SUFFIX.length);
  }
  return key;
}

// Values are tried from the most specific device down to the desktop base.
export function inheritanceChain(baseKey: string, device: Device): string[] {
  switch (device) {
    case "desktop":
      return [baseKey];
    case "tablet":
      return [deviceKey(baseKey, "tablet"), baseKey];
    case "mobile":
      return [
        deviceKey(baseKey, "mobile"),
        deviceKey(baseKey, "tablet"),
        baseKey,
      ];
  }
}

export function resolveDeviceValue<T extends PropValue = PropValue>(
  values: DeviceValueMap,
  baseKey: string,
  device: Device,
): T | undefined {
  for (const key of inheritanceChain(baseKey, device)) {
    const value = values[key];
    if (value !== undefined) {
      return value as T;
    }
  }
  return undefined;
}

export function hasDeviceOverride(
  values: DeviceValueMap,
  baseKey: string,
  device: Device,
): boolean {
  return Object.prototype.hasOwnProperty.call(values, deviceKey(baseKey, device));
}

export function setDeviceValue(
  values: DeviceValueMap,
  baseKey: string,
  device: Device,
  value: PropValue,
): DeviceValueMap {
  return { ...values, [deviceKey(baseKey, device)]: value };
}

// Reset per device: drop the override so the value inherits again. Resetting
// desktop clears the base value itself.
export function resetDeviceValue(
  values: DeviceValueMap,
  baseKey: string,
  device: Device,
): DeviceValueMap {
  const next: DeviceValueMap = { ...values };
  delete next[deviceKey(baseKey, device)];
  return next;
}

// Flatten the override map into effective values for one device.
export function resolveAllForDevice(
  values: DeviceValueMap,
  device: Device,
): DeviceValueMap {
  const bases = new Set<string>();
  for (const key of Object.keys(values)) {
    bases.add(baseKeyOf(key));
  }
  const result: DeviceValueMap = {};
  for (const base of bases) {
    const value = resolveDeviceValue(values, base, device);
    if (value !== undefined) {
      result[base] = value;
    }
  }
  return result;
}

// Keys that carry an explicit override for the given device (desktop has none).
export function deviceOverrides(
  values: DeviceValueMap,
  device: Device,
): string[] {
  if (device === "desktop") {
    return [];
  }
  const suffix = DEVICE_SUFFIX[device];
  return Object.keys(values).filter(
    (key) => key.endsWith(suffix) && values[key] !== undefined,
  );
}
