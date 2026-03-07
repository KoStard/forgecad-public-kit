import type { RunResult, SceneObject } from '../forge/index';
import type { ForgeNotebookOutput, NotebookExecutionSummary } from './model';

function formatVec(values: number[]): string {
  return `[${values.map((value) => value.toFixed(1)).join(', ')}]`;
}

function summarizeObject(object: SceneObject): string {
  if (object.shape) {
    const bbox = object.shape.boundingBox();
    return `${object.name}: vol=${object.shape.volume().toFixed(1)}mm^3 bbox=${formatVec(bbox.min)} -> ${formatVec(bbox.max)}`;
  }
  if (object.sketch) {
    const bounds = object.sketch.bounds();
    return `${object.name}: area=${object.sketch.area().toFixed(1)}mm^2 bounds=${formatVec(bounds.min)} -> ${formatVec(bounds.max)}`;
  }
  return object.name;
}

function summarizeRunResult(result: RunResult): string[] {
  if (result.objects.length === 0) {
    return [
      '(no renderable output)',
      `Time: ${result.timeMs.toFixed(0)}ms`,
    ];
  }

  const lines = [
    `Objects: ${result.objects.length}`,
    ...result.objects.map((object) => `  ${summarizeObject(object)}`),
  ];

  if (result.params.length > 0) {
    lines.push(`Params: ${result.params.map((param) => param.name).join(', ')}`);
  }
  lines.push(`Time: ${result.timeMs.toFixed(0)}ms`);
  return lines;
}

export function buildNotebookOutputs(result: RunResult): ForgeNotebookOutput[] {
  const outputs: ForgeNotebookOutput[] = [];
  const streamText = result.logs.map((entry) => `[${entry.level}] ${entry.args.join(' ')}`);

  if (streamText.length > 0) {
    outputs.push({
      output_type: 'stream',
      name: result.error ? 'stderr' : 'stdout',
      text: streamText,
    });
  }

  if (result.error) {
    outputs.push({
      output_type: 'error',
      ename: 'ForgeError',
      evalue: result.error,
      traceback: streamText.length > 0 ? streamText : [result.error],
    });
    return outputs;
  }

  const summary: NotebookExecutionSummary = {
    objectCount: result.objects.length,
    paramNames: result.params.map((param) => param.name),
    timeMs: result.timeMs,
    error: result.error,
  };

  outputs.push({
    output_type: 'display_data',
    data: {
      'text/plain': summarizeRunResult(result),
      'application/vnd.forgecad.summary+json': summary,
    },
    metadata: {},
  });
  return outputs;
}
