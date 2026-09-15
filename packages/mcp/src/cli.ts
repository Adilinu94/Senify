import { Command } from "commander";
import { pathToFileURL } from "node:url";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("senify")
    .description("Senify — agent-native website platform (local)")
    .version("0.1.0");

  program
    .command("start")
    .description("Start the local engine and open the program in the browser")
    .action(() => {
      console.log("senify start: engine bootstrap lands in ticket 12 (program shell)");
    });

  program
    .command("setup")
    .description("One-command agent onboarding (token, MCP configure, skills)")
    .action(() => {
      console.log("senify setup: lands in ticket 06 (mcp core & agent setup)");
    });

  const mcp = program.command("mcp").description("MCP client integration");
  mcp
    .command("configure")
    .description("Detect Claude Code / Cursor / opencode and write the MCP config")
    .option("--print", "dry-run: print the config instead of writing it")
    .action(() => {
      console.log("senify mcp configure: lands in ticket 06 (mcp core & agent setup)");
    });

  const tokens = program.command("tokens").description("Manage scoped API tokens");
  tokens
    .command("create")
    .description("Create a scoped token (read, write, publish)")
    .option("--name <name>", "client name")
    .option("--scopes <scopes>", "comma-separated scopes", "read,write")
    .option("--expires <expires>", "expiry, e.g. 90d")
    .action(() => {
      console.log("senify tokens create: lands in ticket 06 (mcp core & agent setup)");
    });
  tokens
    .command("list")
    .description("List tokens with last usage")
    .action(() => {
      console.log("senify tokens list: lands in ticket 06 (mcp core & agent setup)");
    });
  tokens
    .command("revoke <id>")
    .description("Revoke a token immediately")
    .action(() => {
      console.log("senify tokens revoke: lands in ticket 06 (mcp core & agent setup)");
    });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  await main();
}
