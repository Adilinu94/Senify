import { describe, expect, it } from "vitest";
import { mergeDeviceVariants } from "../src/import.ts";

// Framer resolves a variant PER WIDTH: the same element reads `88px / 64px /
// 42px` at 1440 / 900 / 390 px from one preset class, and the product card link
// carries `padding: 48px` on the desktop against `30px` on a phone. A load at one
// width therefore only ever describes that width — which is why the import loads
// the page three times and merges each build as its own device.
//
// Measured on `rare-works` (27.10.2026), before the fix: the hero `<h1>` stayed
// 88 px on a phone instead of 42, the product cards 347 px tall instead of 233,
// the page 23.996 px against a source of 20.648. After it: all 15 sections match
// at 1440, 900 and 390 px.
type State = { device: string; hiddenAt: string[]; visual: Record<string, string> };
type Node = {
  key: string;
  tag: string;
  htmlId?: string | null;
  baseClasses: string[];
  states: State[];
  children: Node[];
};

const node = (over: Partial<Node>): Node => ({
  key: "n1",
  tag: "div",
  htmlId: null,
  baseClasses: ["framer-a"],
  states: [{ device: "desktop", hiddenAt: [], visual: {} }],
  children: [],
  ...over,
});

const document = (root: Node) =>
  ({ pages: [{ root }], breakpoints: [], findings: [] }) as never;

type Mapped = {
  pages: { root: { states: State[]; visibleOn?: string[]; children: Node[] } }[];
  findings: { message: string }[];
};

describe("mergeDeviceVariants übernimmt den Aufbau als Gerätezustand", () => {
  it("nimmt den Wert, den der Aufbau an SEINER Breite rendert", () => {
    // Both builds state 88px as their base (the desktop value of that build) and
    // 42px in their own mobile state. Taking the base would keep 88 on a phone.
    const states: State[] = [
      { device: "desktop", hiddenAt: [], visual: { "font-size": "88px" } },
      { device: "mobile", hiddenAt: [], visual: { "font-size": "42px" } },
    ];
    const desktop = document(node({ states }));
    const phone = document(node({ key: "n9", states }));
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as Mapped;
    const root = merged.pages[0]?.root;
    expect(root?.states.find((state) => state.device === "mobile")?.visual["font-size"]).toBe("42px");
    // The desktop value is untouched.
    expect(root?.states.find((state) => state.device === "desktop")?.visual["font-size"]).toBe("88px");
  });

  it("nimmt den einzigen Zustand, wenn der Aufbau keinen eigenen hat", () => {
    // The product card link: the phone build has ONE state, and its values are
    // the phone's (30px padding). There is no mobile state to prefer.
    const desktop = document(
      node({ states: [{ device: "desktop", hiddenAt: [], visual: { padding: "48px 0 0" } }] }),
    );
    const phone = document(
      node({ key: "n9", states: [{ device: "desktop", hiddenAt: [], visual: { padding: "30px 0 0" } }] }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as Mapped;
    const root = merged.pages[0]?.root;
    expect(root?.states.find((state) => state.device === "mobile")?.visual["padding"]).toBe("30px 0 0");
  });

  it("löscht die Hashes, die eine Breite als versteckt markierten, die den Knoten zeigt", () => {
    // The workspace card: the desktop state still named the phone's hash from a
    // build that never rendered it, while tablet and mobile showed the card. The
    // mapper reads that hash as "hidden on a phone" and the section collapsed.
    const desktop = document(
      node({ states: [{ device: "desktop", hiddenAt: ["1xrkzay"], visual: { width: "520px" } }] }),
    );
    const phone = document(
      node({
        key: "n9",
        states: [
          { device: "desktop", hiddenAt: [], visual: { width: "520px" } },
          { device: "mobile", hiddenAt: [], visual: { width: "100%" } },
        ],
      }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as Mapped;
    const root = merged.pages[0]?.root;
    // No state hides anything any more: the card is shown where it exists.
    expect(root?.states.every((state) => state.hiddenAt.length === 0)).toBe(true);
    expect(root?.visibleOn).toBeUndefined();
  });

  it("meldet die übernommenen Werte als Fund", () => {
    const desktop = document(node({}));
    const phone = document(
      node({ key: "n9", states: [{ device: "desktop", hiddenAt: [], visual: { gap: "10px" } }] }),
    );
    const merged = mergeDeviceVariants(desktop, phone, "mobile") as unknown as Mapped;
    expect(merged.findings.some((finding) => finding.message.includes("mobile"))).toBe(true);
  });
});
