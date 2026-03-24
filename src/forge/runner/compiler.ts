/**
 * TypeScript compilation and source-map utilities for the runner sandbox.
 */

import * as ts from 'typescript';
import type { CompiledScript, RunnerExecutionOptions, SourceMapSegment } from './types';

const BASE64_VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_VLQ_LOOKUP = Object.fromEntries(BASE64_VLQ_CHARS.split('').map((char, index) => [char, index])) as Record<string, number>;

function decodeBase64Vlq(segment: string): number[] {
  const values: number[] = [];
  let index = 0;

  while (index < segment.length) {
    let value = 0;
    let shift = 0;
    let continuation = false;

    do {
      const digit = BASE64_VLQ_LOOKUP[segment[index]];
      index += 1;
      if (digit == null) {
        throw new Error(`Invalid source map segment "${segment}"`);
      }
      continuation = (digit & 32) !== 0;
      value += (digit & 31) << shift;
      shift += 5;
    } while (continuation && index < segment.length);

    const signed = (value & 1) === 1 ? -(value >> 1) : value >> 1;
    values.push(signed);
  }

  return values;
}

export function decodeSourceMapSegments(sourceMapText?: string): SourceMapSegment[][] {
  if (!sourceMapText) return [];

  let mappings = '';
  try {
    const parsed = JSON.parse(sourceMapText) as { mappings?: string };
    mappings = typeof parsed.mappings === 'string' ? parsed.mappings : '';
  } catch {
    return [];
  }
  if (!mappings) return [];

  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  let nameIndex = 0;

  return mappings.split(';').map((line) => {
    if (!line) return [];

    let generatedColumn = 0;
    const segments: SourceMapSegment[] = [];
    for (const segmentText of line.split(',')) {
      if (!segmentText) continue;
      const values = decodeBase64Vlq(segmentText);
      generatedColumn += values[0] ?? 0;
      if (values.length >= 4) {
        sourceIndex += values[1];
        sourceLine += values[2];
        sourceColumn += values[3];
        if (values.length >= 5) nameIndex += values[4];
        if (sourceIndex === 0) {
          segments.push({
            generatedColumn,
            sourceLine: sourceLine + 1,
            sourceColumn: sourceColumn + 1,
          });
        }
      }
    }
    void nameIndex;
    return segments;
  });
}

function formatTranspileDiagnostic(fileName: string, code: string, diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const sourceFile = diagnostic.file ?? ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
  return `${message} (${fileName}:${line + 1}:${character + 1})`;
}

export function compileScript(code: string, fileName: string, options: RunnerExecutionOptions): CompiledScript {
  const cached = options.compiledFiles.get(fileName);
  if (cached && cached.source === code) {
    return cached;
  }

  const transpiled = ts.transpileModule(code, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      allowJs: true,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      sourceMap: true,
      inlineSources: true,
      newLine: ts.NewLineKind.LineFeed,
    },
  });

  const diagnostics = (transpiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length > 0) {
    throw new Error(formatTranspileDiagnostic(fileName, code, diagnostics[0]));
  }

  const compiled: CompiledScript = {
    source: code,
    code: transpiled.outputText.replace(/\n\/\/# sourceMappingURL=.*$/u, ''),
    sourceMapSegments: decodeSourceMapSegments(transpiled.sourceMapText),
  };
  options.compiledFiles.set(fileName, compiled);
  return compiled;
}

function mapGeneratedPositionToSource(
  compiled: CompiledScript | undefined,
  generatedLine: number,
  generatedColumn: number,
): { line: number; column: number } | null {
  if (!compiled) return null;
  const segments = compiled.sourceMapSegments[generatedLine - 1];
  if (!segments || segments.length === 0) return null;

  let match = segments[0];
  for (const segment of segments) {
    if (segment.generatedColumn + 1 > generatedColumn) break;
    match = segment;
  }

  return {
    line: match.sourceLine,
    column: match.sourceColumn + Math.max(0, generatedColumn - (match.generatedColumn + 1)),
  };
}

export function resolveErrorLocation(
  stack: string,
  compiledFiles: Map<string, CompiledScript>,
): { fileName: string; line: number; column: number } | null {
  const framePattern = /(?:eval\s+\()?([^()\s]+):(\d+):(\d+)\)?/u;

  for (const line of stack.split('\n')) {
    const match = line.match(framePattern);
    if (!match) continue;
    const [, candidateFile, lineText, columnText] = match;
    if (!compiledFiles.has(candidateFile)) continue;
    const generatedLine = parseInt(lineText, 10);
    const generatedColumn = parseInt(columnText, 10);
    const mapped = mapGeneratedPositionToSource(compiledFiles.get(candidateFile), generatedLine, generatedColumn);
    return {
      fileName: candidateFile,
      line: mapped?.line ?? generatedLine,
      column: mapped?.column ?? generatedColumn,
    };
  }

  const anonymousMatch = stack.match(/<anonymous>:(\d+):(\d+)/u);
  if (!anonymousMatch) return null;
  return {
    fileName: '<anonymous>',
    line: Math.max(1, parseInt(anonymousMatch[1], 10) - 2),
    column: parseInt(anonymousMatch[2], 10),
  };
}

export function createForgeRuntimeModule(bindings: Record<string, unknown>): Record<string, unknown> {
  const runtime = { ...bindings } as Record<string, unknown>;
  Object.defineProperty(runtime, '__esModule', { value: true });
  runtime.default = runtime;
  return runtime;
}
