export type ToolStep = {
  tool: string;
  args: Record<string, unknown>;
};

export type ToolInvoker = (
  tool: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type WorkflowStepResult = {
  tool: string;
  result?: unknown;
  error?: string;
};

export type WorkflowResult = {
  ok: boolean;
  steps: WorkflowStepResult[];
};

export async function runWorkflow(
  invoke: ToolInvoker,
  steps: ToolStep[],
): Promise<WorkflowResult> {
  const results: WorkflowStepResult[] = [];
  for (const step of steps) {
    try {
      const result = await invoke(step.tool, step.args);
      results.push({ tool: step.tool, result });
    } catch (error) {
      results.push({
        tool: step.tool,
        error: error instanceof Error ? error.message : String(error),
      });
      return { ok: false, steps: results };
    }
  }
  return { ok: true, steps: results };
}