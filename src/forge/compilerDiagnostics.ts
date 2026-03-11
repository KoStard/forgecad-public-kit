export type CompilerTarget = 'exact-brep' | 'runtime-manifold' | 'faceted-mesh';

export interface CompilerDiagnostic {
  target: CompilerTarget;
  code: string;
  path: string;
  message: string;
}

export type CompileLoweringResult<T> =
  | { ok: true; value: T; diagnostics: CompilerDiagnostic[] }
  | { ok: false; diagnostics: CompilerDiagnostic[] };

export function compilerDiagnostic(
  target: CompilerTarget,
  code: string,
  path: string,
  message: string,
): CompilerDiagnostic {
  return { target, code, path, message };
}

export function compilerSuccess<T>(value: T, diagnostics: CompilerDiagnostic[] = []): CompileLoweringResult<T> {
  return { ok: true, value, diagnostics };
}

export function compilerFailure<T = never>(...diagnostics: CompilerDiagnostic[]): CompileLoweringResult<T> {
  return { ok: false, diagnostics };
}

export function primaryCompilerDiagnosticMessage(
  diagnostics: CompilerDiagnostic[],
  fallback: string,
): string {
  return diagnostics[0]?.message ?? fallback;
}
