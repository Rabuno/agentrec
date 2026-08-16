export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

export function escapeRegex(value: string): string {
  // We escape * as well, so that if a literal * appears in a segment (e.g. "foo*bar" or "*foo"),
  // it is matched as a literal asterisk instead of being interpreted as a regex quantifier (which would match 0 or more of the preceding character).
  // STANDALONE "*" is handled separately in pathSegmentToRegex.
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

export function pathSegmentToRegex(segment: string): string {
  return segment === '*' ? '[^.]+' : escapeRegex(segment);
}

export function matchesPath(path: string, pattern: string | string[], options?: { caseInsensitive?: boolean }): boolean {
  const patterns = Array.isArray(pattern) ? pattern : [pattern];
  const flags = options?.caseInsensitive ? 'i' : '';
  return patterns.some((p) => {
    const regex = new RegExp(`^${p.split('.').map(pathSegmentToRegex).join('\\.')}$`, flags);
    return regex.test(path);
  });
}
