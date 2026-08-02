import type { GLSLType, Socket } from '../types';

/** Value + func socket types allowed in @in / @out. */
const SOCKET_TYPES = new Set<GLSLType>([
  'float',
  'vec2',
  'vec3',
  'vec4',
  'mat2',
  'mat3',
  'func',
]);

/** Types that may appear as GLSL function parameters / returns (not `func`). */
const VALUE_TYPES = new Set<GLSLType>([
  'float',
  'vec2',
  'vec3',
  'vec4',
  'mat2',
  'mat3',
]);

const FIN_RE =
  /^\s*\/\/\s*@fin\s+([a-zA-Z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const FOUT_RE =
  /^\s*\/\/\s*@fout\s+([a-zA-Z0-9_]+)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;
const IN_RE =
  /^\s*\/\/\s*@in\s+([a-zA-Z0-9_]+)\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const OUT_RE =
  /^\s*\/\/\s*@out\s+([a-zA-Z0-9_]+)(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/;

/**
 * `// @type func` — this node defines a callable GLSL function. Its graph
 * output is always `func`.
 *
 * New style:
 * - `@fin` / `@fout` — GLSL call signature (return + params)
 * - `@fin func name` — function binding (graph wire)
 * - `@in` — graph sockets only (value = closed-over specialization)
 *
 * Legacy (no `@fin`/`@fout`): value `@in` = signature, `@in func` = wire,
 * `@out` = return type.
 */
export function parseIsFunc(glsl: string): boolean {
  const re = /^\s*\/\/\s*@type\s+func\s*$/;
  return glsl.split('\n').some((line) => re.test(line));
}

/** True when the body uses `@fin` / `@fout` (vs legacy `@in`/`@out` signature). */
export function usesFinFout(glsl: string): boolean {
  return glsl.split('\n').some((line) => FIN_RE.test(line) || FOUT_RE.test(line));
}

/**
 * Derive a node's *graph* input sockets.
 * Value nodes: all `@in`.
 * Func nodes (new): `@in …` plus `@fin func …`.
 * Func nodes (legacy): only `@in func …`.
 */
export function parseInputs(glsl: string): Socket[] {
  const isFunc = parseIsFunc(glsl);
  const modern = isFunc && usesFinFout(glsl);
  const sockets: Socket[] = [];
  const seen = new Set<string>();

  for (const line of glsl.split('\n')) {
    const fin = line.match(FIN_RE);
    if (fin && isFunc) {
      const type = fin[1] as GLSLType;
      const name = fin[2];
      // Only `@fin func` becomes a graph wire; value `@fin` is signature-only.
      if (type === 'func' && !seen.has(name)) {
        seen.add(name);
        sockets.push({ id: name, name, type: 'func' });
      }
      continue;
    }

    const m = line.match(IN_RE);
    if (!m) continue;
    const type = m[1] as GLSLType;
    const name = m[2];
    if (!SOCKET_TYPES.has(type) || seen.has(name)) continue;
    if (isFunc && !modern && type !== 'func') continue;
    seen.add(name);
    sockets.push({ id: name, name, type });
  }
  return sockets;
}

/**
 * Signature parameters for a `@type func` node.
 * New: value `@fin`s. Legacy: value `@in`s.
 */
export function parseFuncSignature(glsl: string): Socket[] {
  if (!parseIsFunc(glsl)) return [];
  const modern = usesFinFout(glsl);
  const sockets: Socket[] = [];
  const seen = new Set<string>();
  const re = modern ? FIN_RE : IN_RE;

  for (const line of glsl.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const type = m[1] as GLSLType;
    const name = m[2];
    if (!VALUE_TYPES.has(type) || seen.has(name)) continue;
    seen.add(name);
    sockets.push({ id: name, name, type });
  }
  return sockets;
}

/**
 * Return type of a `@type func` node's GLSL function.
 * Prefers `@fout`, then legacy `@out`.
 */
export function parseFuncReturnType(glsl: string): GLSLType {
  for (const line of glsl.split('\n')) {
    const fout = line.match(FOUT_RE);
    if (fout) {
      const type = fout[1] as GLSLType;
      if (VALUE_TYPES.has(type)) return type;
    }
  }
  for (const line of glsl.split('\n')) {
    const m = line.match(OUT_RE);
    if (!m) continue;
    const type = m[1] as GLSLType;
    if (VALUE_TYPES.has(type)) return type;
  }
  return 'float';
}

/**
 * Derive a node's graph output from `@out` / `@type func`.
 * Func nodes always expose a single `func` output.
 */
export function parseOutput(
  glsl: string,
): { type: GLSLType; name: string } | null {
  if (parseIsFunc(glsl)) {
    return { type: 'func', name: 'out' };
  }
  for (const line of glsl.split('\n')) {
    const m = line.match(OUT_RE);
    if (!m) continue;
    const type = m[1] as GLSLType;
    if (SOCKET_TYPES.has(type) && type !== 'func') {
      return { type, name: m[2] || 'out' };
    }
  }
  return null;
}
