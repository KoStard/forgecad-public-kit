export interface NormalizeVariadicArgsOptions<T> {
  apiName: string;
  inputs: readonly unknown[];
  minCount: number;
  itemName: string;
  usage: string;
  coerce: (value: unknown) => T;
}

export function describeApiArg(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    return name && name !== 'Object' ? name : 'object';
  }
  if (typeof value === 'string') return `"${value}"`;
  return typeof value;
}

export function normalizeVariadicArgs<T>({ apiName, inputs, minCount, itemName, usage, coerce }: NormalizeVariadicArgsOptions<T>): T[] {
  const flattened: unknown[] = [];
  for (const input of inputs) {
    if (Array.isArray(input)) flattened.push(...input);
    else flattened.push(input);
  }

  if (flattened.length < minCount) {
    const plural = minCount === 1 ? itemName : `${itemName}s`;
    throw new Error(`${apiName} requires at least ${minCount} ${plural}. ${usage}`);
  }

  return flattened.map((value, index) => {
    try {
      return coerce(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${apiName} argument ${index + 1}: ${message}`);
    }
  });
}
