import type { AgentTrace } from './core/types.js';

export type TraceDiff = {
  equal: boolean;
  differences: string[];
};

export type DiffOptions = {
  /** Dotted paths to ignore, e.g. runId, startedAt, events.*.timestamp. */
  ignorePaths?: string[];
  compareEventData?: boolean;
};

const DEFAULT_IGNORE_PATHS = ['runId', 'startedAt', 'finishedAt', 'durationMs', 'events.*.id', 'events.*.timestamp'];

export function diffTraces(a: AgentTrace, b: AgentTrace, options: DiffOptions = {}): TraceDiff {
  const differences: string[] = [];
  const ignorePaths = [...DEFAULT_IGNORE_PATHS, ...(options.ignorePaths ?? [])];
  const compareEventData = options.compareEventData ?? true;

  if (a.status !== b.status) differences.push(`status changed: ${a.status} -> ${b.status}`);

  if (!deepEqual(a.output, b.output)) {
    differences.push('final output changed');
    differences.push(...compareValues(a.output, b.output, 'output', ignorePaths));
  }

  if (a.events.length !== b.events.length) {
    differences.push(`event count changed: ${a.events.length} -> ${b.events.length}`);
  }

  const aToolCalls = a.events.filter((event) => event.type === 'tool.call').map((event) => event.name);
  const bToolCalls = b.events.filter((event) => event.type === 'tool.call').map((event) => event.name);
  if (!deepEqual(aToolCalls, bToolCalls)) {
    differences.push(`tool call sequence changed: ${aToolCalls.join(',')} -> ${bToolCalls.join(',')}`);
  }

  const eventLimit = Math.min(a.events.length, b.events.length);
  for (let index = 0; index < eventLimit; index++) {
    const left = a.events[index];
    const right = b.events[index];

    if (left.type !== right.type) differences.push(`events.${index}.type changed: ${left.type} -> ${right.type}`);
    if (left.name !== right.name) differences.push(`events.${index}.name changed: ${left.name ?? ''} -> ${right.name ?? ''}`);

    if (compareEventData) {
      differences.push(...compareValues(left.data, right.data, `events.${index}.data`, ignorePaths));
    }
  }

  const structuralA = normalizeForCompare(a, ignorePaths, compareEventData);
  const structuralB = normalizeForCompare(b, ignorePaths, compareEventData);
  differences.push(...compareValues(structuralA.metadata, structuralB.metadata, 'metadata', ignorePaths));
  differences.push(...compareValues(structuralA.input, structuralB.input, 'input', ignorePaths));

  return { equal: differences.length === 0, differences: unique(differences) };
}

function compareValues(left: unknown, right: unknown, path: string, ignorePaths: string[]): string[] {
  if (matchesPath(path, ignorePaths) || deepEqual(left, right)) return [];

  if (isPlainObject(left) || isPlainObject(right)) {
    const leftObject = isPlainObject(left) ? left : {};
    const rightObject = isPlainObject(right) ? right : {};
    const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]);
    return [...keys].flatMap((key) => compareValues(leftObject[key], rightObject[key], `${path}.${key}`, ignorePaths));
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    const leftArray = Array.isArray(left) ? left : [];
    const rightArray = Array.isArray(right) ? right : [];
    const size = Math.max(leftArray.length, rightArray.length);
    return Array.from({ length: size }, (_, index) => compareValues(leftArray[index], rightArray[index], `${path}.${index}`, ignorePaths)).flat();
  }

  return [`${path} changed: ${stableStringify(left)} -> ${stableStringify(right)}`];
}

function normalizeForCompare(trace: AgentTrace, ignorePaths: string[], compareEventData: boolean): AgentTrace {
  return stripIgnored(
    {
      ...trace,
      events: compareEventData ? trace.events : trace.events.map(({ data: _data, ...event }) => event),
    },
    ignorePaths,
  ) as AgentTrace;
}

function stripIgnored(value: unknown, ignorePaths: string[], path: string[] = []): unknown {
  const pathString = path.join('.');
  if (pathString && matchesPath(pathString, ignorePaths)) return undefined;

  if (Array.isArray(value)) return value.map((item, index) => stripIgnored(item, ignorePaths, [...path, String(index)]));

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stripIgnored(value[key], ignorePaths, [...path, key])])
        .filter(([, child]) => child !== undefined),
    );
  }

  return value;
}

function matchesPath(path: string, patterns: string[]) {
  return patterns.some((pattern) => {
    const regex = new RegExp(`^${pattern.split('.').map(pathSegmentToRegex).join('\\.')}$`);
    return regex.test(path);
  });
}

function pathSegmentToRegex(segment: string) {
  return segment === '*' ? '[^.]+' : escapeRegex(segment);
}

function deepEqual(left: unknown, right: unknown) {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
  }
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

function escapeRegex(value: string) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function unique(values: string[]) {
  return [...new Set(values)];
}
