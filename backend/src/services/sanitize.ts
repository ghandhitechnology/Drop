/** Prompt-integrity backstop: the recognition model's output schema has no
 * field that can hold a footprint, and this sanitizer rejects any response
 * that smuggles one in anyway. */

const FORBIDDEN_KEY = /(litre|liter|water|footprint|\bwf\b|l_per)/i;

export interface SanitizeResult {
  ok: boolean;
  violations: string[];
}

export function sanitizeModelOutput(obj: unknown): SanitizeResult {
  const violations: string[] = [];
  walk(obj, '', violations);
  return { ok: violations.length === 0, violations };
}

function walk(node: unknown, path: string, violations: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, violations));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (FORBIDDEN_KEY.test(k)) violations.push(p);
      walk(v, p, violations);
    }
  }
}
