import type { AgentTrace } from './types.js';
import { isPlainObject, matchesPath } from './pathMatch.js';

export const DEFAULT_REDACTION_REPLACEMENT = '[REDACTED]';

export type RedactionRule = {
  /** Match an object key anywhere in a trace, case-insensitive by default. */
  key?: string | RegExp;
  /** Match a dotted path such as metadata.apiKey or events.*.data.authorization. */
  path?: string | RegExp;
  /** Replace string values matching this pattern. */
  pattern?: RegExp;
  /** Custom replacement for this rule. */
  replacement?: string;
};

export type RedactionOptions = {
  /** Additional redaction rules. Defaults stay enabled unless includeDefaults is false. */
  rules?: RedactionRule[];
  includeDefaults?: boolean;
  replacement?: string;
};

const DEFAULT_SECRET_KEY_PATTERN = /^(api[-_]?key|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|token|password|secret|client[-_]?secret)$/i;

const DEFAULT_SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /sk-or-v1-[A-Za-z0-9_-]{16,}/g,
  /ghp_[A-Za-z0-9_]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
];

export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  { key: DEFAULT_SECRET_KEY_PATTERN },
  ...DEFAULT_SECRET_VALUE_PATTERNS.map((pattern) => ({ pattern })),
];

export function redactTrace(trace: AgentTrace, options: RedactionOptions = {}): AgentTrace {
  return redactValue(trace, options) as AgentTrace;
}

export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  const rules = options.includeDefaults === false ? options.rules ?? [] : [...DEFAULT_REDACTION_RULES, ...(options.rules ?? [])];
  const replacement = options.replacement ?? DEFAULT_REDACTION_REPLACEMENT;
  return redactUnknown(value, rules, replacement, []);
}

function redactUnknown(
  value: unknown,
  rules: RedactionRule[],
  defaultReplacement: string,
  path: string[],
): unknown {
  if (typeof value === 'string') {
    return rules.reduce((current, rule) => {
      if (!rule.pattern) return current;
      return current.replace(rule.pattern, rule.replacement ?? defaultReplacement);
    }, value);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => redactUnknown(item, rules, defaultReplacement, [...path, String(index)]));
  }

  if (!isPlainObject(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const matchingRule = rules.find((rule) => matchesRule(rule, key, childPath));

    output[key] = matchingRule
      ? matchingRule.replacement ?? defaultReplacement
      : redactUnknown(child, rules, defaultReplacement, childPath);
  }

  return output;
}

function matchesRule(rule: RedactionRule, key: string, path: string[]) {
  return matches(rule.key, key) || matches(rule.path, pathToString(path));
}

function matches(matcher: string | RegExp | undefined, value: string) {
  if (!matcher) return false;
  if (typeof matcher === 'string') return matcher.includes('.') ? matchesPath(value, matcher, { caseInsensitive: true }) : matcher.toLowerCase() === value.toLowerCase();
  matcher.lastIndex = 0;
  return matcher.test(value);
}

function pathToString(path: string[]) {
  return path.join('.');
}
