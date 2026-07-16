import type { GLSLType, Socket } from '../types';

const TYPES = new Set<GLSLType>(['float', 'vec2', 'vec3', 'vec4']);

/**
 * Derive a node's input sockets from `// @in <type> <name>` directives in its
 * GLSL body. The code is the single source of truth for a node's signature:
 * each directive becomes a typed input socket (and therefore a function
 * parameter the body can reference).
 *
 * Example:
 *   // @in float radius
 *   // @in vec3 tint
 *
 * Lines are matched case-sensitively; unknown types and duplicate names are
 * ignored. Order is preserved.
 */
export function parseInputs(glsl: string): Socket[] {
  const sockets: Socket[] = [];
  const seen = new Set<string>();
  const re = /^\s*\/\/\s*@in\s+([a-zA-Z0-9_]+)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*$/;

  for (const line of glsl.split('\n')) {
    const m = line.match(re);
    if (!m) continue;
    const type = m[1] as GLSLType;
    const name = m[2];
    if (!TYPES.has(type) || seen.has(name)) continue;
    seen.add(name);
    sockets.push({ id: name, name, type });
  }
  return sockets;
}
