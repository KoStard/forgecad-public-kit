import type { RunResult, SceneObject } from '../forge/index';
import { formatArea, formatVolume, type LengthUnit } from '../forge/units';
import type { ForgeNotebookOutput, NotebookExecutionSummary } from './model';

function formatVec(values: number[]): string {
  return `[${values.map((value) => value.toFixed(1)).join(', ')}]`;
}

function summarizeObject(object: SceneObject, unit: LengthUnit = 'mm'): string {
  if (object.shape) {
    const bbox = object.shape.boundingBox();
    const bodies = object.shape.numBodies();
    const bodiesSuffix = bodies > 1 ? ` bodies=${bodies}` : '';
    return `${object.name}: vol=${formatVolume(object.shape.volume(), unit, 1)} bbox=${formatVec(bbox.min)} -> ${formatVec(bbox.max)}${bodiesSuffix}`;
  }
  if (object.sketch) {
    const bounds = object.sketch.bounds();
    const regions = object.sketch.regions().length;
    const regionsSuffix = regions > 1 ? ` regions=${regions}` : '';
    return `${object.name}: area=${formatArea(object.sketch.area(), unit, 1)} bounds=${formatVec(bounds.min)} -> ${formatVec(bounds.max)}${regionsSuffix}`;
  }
  return object.name;
}

function summarizeRunResult(result: RunResult): string[] {
  if (result.objects.length === 0) {
    return ['(no renderable output)', `Time: ${result.timeMs.toFixed(0)}ms`];
  }

  let totalBodies = 0;
  for (const obj of result.objects) {
    if (obj.shape) totalBodies += obj.shape.numBodies();
    else if (obj.sketch) totalBodies += obj.sketch.regions().length;
  }
  const bodiesTag = totalBodies !== result.objects.length ? ` (${totalBodies} ${totalBodies === 1 ? 'body' : 'bodies'})` : '';
  const lines = [`Objects: ${result.objects.length}${bodiesTag}`, ...result.objects.map((object) => `  ${summarizeObject(object)}`)];

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
