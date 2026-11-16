import { describe, expect, it } from "vitest";
import type { EditorNode } from "@senify/editor/state";
import { normalizeDesignCanvasFrame } from "../src/mapper.ts";

function frame(id: string, props: Record<string, unknown>, children: string[] = []): EditorNode {
  return { id, primitive: "frame", props: props as EditorNode["props"], children };
}

function page(children: string[]): EditorNode {
  return { id: "root", primitive: "root", props: {}, children };
}

describe("Design-Canvas-Erkennung", () => {
  it("normalisiert das absolut gesetzte Desktop-Frame mit Pixelbreite", () => {
    const nodes: Record<string, EditorNode> = {
      root: page(["canvas"]),
      canvas: frame("canvas", { position: "absolute", width: "1200px", left: "99px", top: "0px" }),
    };
    normalizeDesignCanvasFrame(nodes, nodes["root"]);
    expect(nodes["canvas"]?.props).toMatchObject({
      position: "relative",
      left: "0px",
      top: "0px",
      width: "100%",
      maxWidth: "none",
      minHeight: "100vh",
    });
  });

  it("findet das Canvas in einem Seiten-Wrapper", () => {
    const nodes: Record<string, EditorNode> = {
      root: page(["wrapper"]),
      wrapper: frame("wrapper", { position: "relative", width: "100%" }, ["canvas"]),
      canvas: frame("canvas", { position: "absolute", width: "1200px" }),
    };
    normalizeDesignCanvasFrame(nodes, nodes["root"]);
    expect(nodes["wrapper"]?.props).toMatchObject({ position: "relative", width: "100%" });
    expect(nodes["canvas"]?.props).toMatchObject({ position: "relative", width: "100%", minHeight: "100vh" });
  });

  it("lässt einen normalen Abschnitt mit absolutem Hintergrund stehen", () => {
    const nodes: Record<string, EditorNode> = {
      root: page(["section"]),
      section: frame("section", { position: "relative", width: "100%" }, ["background"]),
      background: frame("background", { position: "absolute", width: "100%" }),
    };
    normalizeDesignCanvasFrame(nodes, nodes["root"]);
    expect(nodes["background"]?.props).toMatchObject({ position: "absolute", width: "100%" });
  });

  it("normalisiert das einzige absolute Top-Level-Frame auch ohne Pixelbreite", () => {
    const nodes: Record<string, EditorNode> = {
      root: page(["canvas"]),
      canvas: frame("canvas", { position: "absolute", width: "100%" }),
    };
    normalizeDesignCanvasFrame(nodes, nodes["root"]);
    expect(nodes["canvas"]?.props).toMatchObject({ position: "relative", width: "100%" });
  });

  it("bevorzugt bei mehreren Frames die gemessene Pixelbreite", () => {
    const nodes: Record<string, EditorNode> = {
      root: page(["overlay", "canvas"]),
      overlay: frame("overlay", { position: "absolute", width: "100%" }),
      canvas: frame("canvas", { position: "absolute", width: "1200px" }),
    };
    normalizeDesignCanvasFrame(nodes, nodes["root"]);
    expect(nodes["overlay"]?.props).toMatchObject({ position: "absolute", width: "100%" });
    expect(nodes["canvas"]?.props).toMatchObject({ position: "relative", width: "100%" });
  });
});
