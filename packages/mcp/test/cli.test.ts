import { describe, expect, it } from "vitest";
import { createProgram } from "@senify/mcp";

function commandNames(program: ReturnType<typeof createProgram>): string[] {
  return program.commands.map((command) => command.name());
}

describe("senify CLI skeleton", () => {
  it("exposes the skeleton commands", () => {
    const program = createProgram();
    expect(commandNames(program)).toEqual(["start", "setup", "mcp", "tokens"]);
  });

  it("nests mcp configure and the tokens commands", () => {
    const program = createProgram();
    const mcp = program.commands.find((command) => command.name() === "mcp");
    const tokens = program.commands.find((command) => command.name() === "tokens");
    expect(mcp?.commands.map((c) => c.name())).toEqual(["configure"]);
    expect(tokens?.commands.map((c) => c.name())).toEqual(["create", "list", "revoke"]);
  });
});
