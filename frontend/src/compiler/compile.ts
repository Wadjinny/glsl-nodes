import type { Edge } from '@xyflow/react';
import type { RFNode } from '../nodes/library';
import type { GLSLType, Socket } from '../types';
import {
  TYPE_DEFAULT,
  controlUniformType,
  isControlNode,
  isFuncNode,
} from '../types';
import {
  parseFuncReturnType,
  parseFuncSignature,
  parseIsFunc,
} from './parseInputs';
import { topoSort } from './topo';

export interface CompileResult {
  fragSource: string | null;
  error: string | null;
}

const VERTEX_SHADER = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function getVertexShader(): string {
  return VERTEX_SHADER;
}

/**
 * Built-in values, emitted as top-level GLSL globals assigned at the start of
 * main() — so every node body can reference them directly (a node's `// @in`
 * parameter of the same name shadows the global, letting a wire override it).
 */
const BUILTINS: Record<string, { expr: string; type: GLSLType }> = {
  uv: { expr: 'uv', type: 'vec2' },
  fragCoord: { expr: 'fragCoord', type: 'vec2' },
  resolution: { expr: 'resolution', type: 'vec2' },
  time: { expr: 'time', type: 'float' },
  mouse: { expr: 'mouse', type: 'vec2' },
};

/** GLSL type produced at a node's output handle (null if unknown). */
export function outputTypeOf(
  node: RFNode,
  handle: string | null | undefined,
): GLSLType | null {
  if (node.data.isInput) return handle ? BUILTINS[handle]?.type ?? null : null;
  return controlUniformType(node.data) ?? node.data.outputs[0]?.type ?? null;
}

const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const fnName = (id: string) => `node_${sanitize(id)}`;
const localName = (id: string) => `${fnName(id)}_out`;

/** GLSL uniform name for a Slider/Color node (also used by the renderer). */
export const uniformName = (id: string) => `uCtl_${sanitize(id)}`;

function resolveEmitName(node: RFNode, used: Set<string>): string {
  const raw =
    typeof node.data.glslName === 'string' && node.data.glslName.trim()
      ? sanitize(node.data.glslName.trim())
      : fnName(node.id);
  let name = raw && /^[A-Za-z_]/.test(raw) ? raw : fnName(node.id);
  if (used.has(name)) name = `${name}_${sanitize(node.id)}`;
  used.add(name);
  return name;
}

/** Walk only value-typed edges when deciding what to invoke in main(). */
function reachableFromOutput(
  outputId: string,
  edges: Edge[],
  byId: Map<string, RFNode>,
): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const e of edges) {
    if (!e.target || !e.source || !e.targetHandle) continue;
    const target = byId.get(e.target);
    const sock = target?.data.inputs.find((s) => s.id === e.targetHandle);
    // Skip func bindings — they don't cause the callee to be invoked in main().
    if (sock?.type === 'func') continue;
    const list = incoming.get(e.target) ?? [];
    list.push(e.source);
    incoming.set(e.target, list);
  }
  const seen = new Set<string>();
  const stack = [outputId];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const src of incoming.get(id) ?? []) stack.push(src);
  }
  return seen;
}

/** Rewrite `name(` call sites to the bound emit name when they differ. */
function rewriteFuncCalls(
  body: string,
  binds: Map<string, string>,
): string {
  let out = body;
  for (const [socketName, emitName] of binds) {
    if (socketName === emitName) continue;
    const re = new RegExp(`\\b${socketName}\\s*\\(`, 'g');
    out = out.replace(re, `${emitName}(`);
  }
  return out;
}

function stripDirectiveNoise(src: string): string {
  return src
    .split('\n')
    .filter(
      (line) =>
        !/^\s*\/\/\s*@(in|out|type|fin|fout)\b/.test(line),
    )
    .join('\n')
    .trim();
}

/** Coerce a GLSL expression of type `from` to type `to`. */
function coerce(expr: string, from: GLSLType, to: GLSLType): string {
  if (from === to) return expr;
  if (from === 'func' || to === 'func') return expr;
  const e = `(${expr})`;
  if (from === 'float') return `${to}(${expr})`;
  switch (`${from}->${to}`) {
    case 'vec3->vec4':
      return `vec4(${expr}, 1.0)`;
    case 'vec2->vec3':
      return `vec3(${expr}, 0.0)`;
    case 'vec2->vec4':
      return `vec4(${expr}, 0.0, 1.0)`;
    case 'vec4->vec3':
      return `${e}.rgb`;
    case 'vec3->vec2':
    case 'vec4->vec2':
      return `${e}.xy`;
    case 'vec2->float':
    case 'vec3->float':
    case 'vec4->float':
      return `${e}.x`;
    case 'vec2->mat2':
      return `mat2(${expr}, vec2(0.0))`;
    case 'vec4->mat2':
      return `mat2(${e}.xy, ${e}.zw)`;
    case 'mat2->vec2':
      return `${e}[0]`;
    case 'mat2->vec4':
      return `vec4(${e}[0], ${e}[1])`;
    case 'mat2->vec3':
      return `vec3(${e}[0], ${e}[1].x)`;
    case 'mat2->float':
      return `${e}[0][0]`;
    case 'vec3->mat3':
      return `mat3(${expr}, vec3(0.0), vec3(0.0))`;
    case 'mat3->vec3':
      return `${e}[0]`;
    case 'mat3->vec2':
      return `${e}[0].xy`;
    case 'mat3->float':
      return `${e}[0][0]`;
    case 'mat3->vec4':
      return `vec4(${e}[0], 1.0)`;
    case 'mat2->mat3':
      return `mat3(${e}[0], 0.0, ${e}[1], 0.0, 0.0, 0.0, 1.0)`;
    case 'mat3->mat2':
      return `mat2(${e}[0].xy, ${e}[1].xy)`;
    default:
      return expr;
  }
}

export function compileGraph(
  nodes: RFNode[],
  edges: Edge[],
  preamble = '',
): CompileResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outputNode = nodes.find((n) => n.data.isOutput);
  if (!outputNode) {
    return { fragSource: null, error: 'No Output node in the graph.' };
  }

  const { order, hasCycle } = topoSort(nodes, edges);
  if (hasCycle) {
    return { fragSource: null, error: 'Graph contains a cycle.' };
  }

  const reachable = reachableFromOutput(outputNode.id, edges, byId);

  const incoming = new Map<string, Edge>();
  for (const e of edges) {
    if (e.target && e.targetHandle) {
      incoming.set(`${e.target}:${e.targetHandle}`, e);
    }
  }

  const usedNames = new Set<string>();
  const emitNameById = new Map<string, string>();
  for (const id of order) {
    const node = byId.get(id);
    if (
      !node ||
      node.data.isInput ||
      node.data.isOutput ||
      isControlNode(node.data)
    )
      continue;
    emitNameById.set(id, resolveEmitName(node, usedNames));
  }

  /** Resolve a non-func input to a GLSL expression for main() invocation. */
  function resolveValueInput(
    nodeId: string,
    socket: Socket,
  ): { expr: string; type: GLSLType } {
    const fallback = () =>
      BUILTINS[socket.name] ?? {
        expr: TYPE_DEFAULT[socket.type],
        type: socket.type,
      };

    const edge = incoming.get(`${nodeId}:${socket.id}`);
    if (!edge || !edge.sourceHandle) return fallback();
    const src = byId.get(edge.source);
    if (!src) return fallback();

    if (src.data.isInput) {
      return BUILTINS[edge.sourceHandle] ?? fallback();
    }

    const ctlType = controlUniformType(src.data);
    if (ctlType) {
      return { expr: uniformName(src.id), type: ctlType };
    }

    if (isFuncNode(src.data)) {
      // Should not happen for value sockets.
      return fallback();
    }

    const out = src.data.outputs[0];
    if (!out || out.type === 'func') return fallback();
    return { expr: localName(src.id), type: out.type };
  }

  /** Map `@in`/`@fin` func socket names → emitted GLSL callee names. */
  function funcBindsFor(nodeId: string): Map<string, string> {
    const node = byId.get(nodeId);
    const binds = new Map<string, string>();
    if (!node) return binds;
    for (const s of node.data.inputs) {
      if (s.type !== 'func') continue;
      const edge = incoming.get(`${nodeId}:${s.id}`);
      if (!edge) continue;
      const src = byId.get(edge.source);
      if (!src || !isFuncNode(src.data)) continue;
      const emit = emitNameById.get(src.id);
      if (emit) binds.set(s.name, emit);
    }
    return binds;
  }

  /**
   * Resolve a closed-over `@in` on a func node. Only builtins, control
   * uniforms, and defaults work — value-node locals live in main() and
   * cannot be captured into a top-level GLSL function.
   */
  function resolveClosedOver(
    nodeId: string,
    socket: Socket,
  ): { expr: string; type: GLSLType } | { error: string } {
    const fallback = () =>
      BUILTINS[socket.name] ?? {
        expr: TYPE_DEFAULT[socket.type],
        type: socket.type,
      };

    const edge = incoming.get(`${nodeId}:${socket.id}`);
    if (!edge || !edge.sourceHandle) return fallback();
    const src = byId.get(edge.source);
    if (!src) return fallback();

    if (src.data.isInput) {
      return BUILTINS[edge.sourceHandle] ?? fallback();
    }

    const ctlType = controlUniformType(src.data);
    if (ctlType) {
      return { expr: uniformName(src.id), type: ctlType };
    }

    return {
      error: `Func closed-over '@in ${socket.type} ${socket.name}' on node '${nodeId}' must wire to a control, builtin, or stay unconnected (value nodes live in main() and cannot be captured).`,
    };
  }

  const functions: string[] = [];
  const locals: string[] = [];

  for (const id of order) {
    const node = byId.get(id);
    if (
      !node ||
      node.data.isInput ||
      node.data.isOutput ||
      isControlNode(node.data)
    )
      continue;

    const out = node.data.outputs[0];
    if (!out) continue;

    const emitName = emitNameById.get(id) ?? fnName(id);
    const binds = funcBindsFor(id);
    const rawBody = stripDirectiveNoise(node.data.glsl);
    const body = rewriteFuncCalls(rawBody, binds);

    if (isFuncNode(node.data) || parseIsFunc(node.data.glsl)) {
      // Callable definition — signature from @fin (or legacy value @in).
      const sig =
        node.data.funcSignature ?? parseFuncSignature(node.data.glsl);
      const ret = parseFuncReturnType(node.data.glsl);
      const params = sig.map((s) => `${s.type} ${s.name}`).join(', ');

      const closes = node.data.inputs.filter((s) => s.type !== 'func');
      const closeLines: string[] = [];
      for (const s of closes) {
        const r = resolveClosedOver(id, s);
        if ('error' in r) {
          return { fragSource: null, error: r.error };
        }
        closeLines.push(
          `${s.type} ${s.name} = ${coerce(r.expr, r.type, s.type)};`,
        );
      }

      const parts = [...closeLines, body || `return ${TYPE_DEFAULT[ret]};`];
      const fnBody = parts.join('\n');
      functions.push(`${ret} ${emitName}(${params}) {\n${indent(fnBody)}\n}`);
      continue;
    }

    // Value node: parameters are non-func graph inputs.
    const valueIns = node.data.inputs.filter((s) => s.type !== 'func');
    const params = valueIns.map((s) => `${s.type} ${s.name}`).join(', ');
    const ret = out.type === 'func' ? 'float' : out.type;
    const fnBody = body || `return ${TYPE_DEFAULT[ret]};`;
    functions.push(`${ret} ${emitName}(${params}) {\n${indent(fnBody)}\n}`);

    if (!reachable.has(id)) continue;

    const args = valueIns
      .map((s) => {
        const r = resolveValueInput(id, s);
        return coerce(r.expr, r.type, s.type);
      })
      .join(', ');
    locals.push(`  ${ret} ${localName(id)} = ${emitName}(${args});`);
  }

  const colorSocket = outputNode.data.inputs[0];
  let colorAssign = '  fragColor = vec4(0.0, 0.0, 0.0, 1.0);';
  if (colorSocket) {
    const r = resolveValueInput(outputNode.id, colorSocket);
    colorAssign = `  fragColor = ${coerce(r.expr, r.type, 'vec4')};`;
  }

  const controlUniforms = nodes
    .filter((n) => isControlNode(n.data))
    .map((n) => `uniform ${controlUniformType(n.data)} ${uniformName(n.id)};`)
    .join('\n');

  const preambleBlock = preamble.trim() ? `\n${preamble.trim()}\n` : '';

  const fragSource = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
${controlUniforms ? controlUniforms + '\n' : ''}
out vec4 fragColor;

// Built-ins, ambient in every node body (assigned at the start of main()).
vec2 uv;
vec2 fragCoord;
vec2 resolution;
float time;
vec2 mouse;
${preambleBlock}
${functions.join('\n\n')}

void main() {
  uv = gl_FragCoord.xy / uResolution;
  fragCoord = gl_FragCoord.xy;
  resolution = uResolution;
  time = uTime;
  mouse = uMouse;
${locals.join('\n')}
${colorAssign}
}
`;

  return { fragSource, error: null };
}

function indent(src: string): string {
  return src
    .split('\n')
    .map((line) => '  ' + line)
    .join('\n');
}
