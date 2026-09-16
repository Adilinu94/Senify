// Launches the Senify MCP server on plain Node: the section registry ships
// .tsx components that Node cannot load, so tsx is registered first and the
// CLI is imported through it. Agent clients spawn exactly this file
// (`node launch.mjs mcp serve`), which keeps the generated config free of
// shell wrappers and machine-specific tsx binary paths.
import { register } from "tsx/esm/api";

register();
// cli.ts only runs main() when it is the process entry, so run it explicitly
// with the arguments the client passed ([node, launch.mjs, "mcp", "serve"]).
const cli = await import("./src/cli.ts");

await cli.main();
