import type { Edge } from '@xyflow/react';
import type { RFNode } from '../nodes/library';
import type { GLSLType } from '../types';
import { TYPE_DEFAULT } from '../types';
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

/** Map Input node output socket id -> the global variable available in main(). */
const INPUT_GLOBALS: Record<string, { expr: string; type: GLSLType }> = {
  uv: { expr: 'vUv', type: 'vec2' },
  fragCoord: { expr: 'vFragCoord', type: 'vec2' },
  resolution: { expr: 'vResolution', type: 'vec2' },
  time: { expr: 'vTime', type: 'float' },
  mouse: { expr: 'vMouse', type: 'vec2' },
};

const sanitize = (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_');
const fnName = (id: string) => `node_${sanitize(id)}`;
const localName = (id: string) => `${fnName(id)}_out`;

/** GLSL uniform name for a Slider node (also used by the renderer). */
export const uniformName = (id: string) => `uCtl_${sanitize(id)}`;

/** Coerce a GLSL expression of type `from` to type `to`. */
function coerce(expr: string, from: GLSLType, to: GLSLType): string {
  if (from === to) return expr;
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
    default:
      return expr;
  }
}

export function compileGraph(nodes: RFNode[], edges: Edge[]): CompileResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outputNode = nodes.find((n) => n.data.isOutput);
  if (!outputNode) {
    return { fragSource: null, error: 'No Output node in the graph.' };
  }

  const { order, hasCycle } = topoSort(nodes, edges);
  if (hasCycle) {
    return { fragSource: null, error: 'Graph contains a cycle.' };
  }

  // edge lookup keyed by "targetId:targetHandle"
  const incoming = new Map<string, Edge>();
  for (const e of edges) {
    if (e.target && e.targetHandle) {
      incoming.set(`${e.target}:${e.targetHandle}`, e);
    }
  }

  /** Resolve the value feeding a node's input socket. */
  function resolveInput(
    nodeId: string,
    socketId: string,
    declaredType: GLSLType,
  ): { expr: string; type: GLSLType } {
    const edge = incoming.get(`${nodeId}:${socketId}`);
    if (!edge || !edge.sourceHandle) {
      return { expr: TYPE_DEFAULT[declaredType], type: declaredType };
    }
    const src = byId.get(edge.source);
    if (!src) return { expr: TYPE_DEFAULT[declaredType], type: declaredType };

    if (src.data.isInput) {
      const g = INPUT_GLOBALS[edge.sourceHandle];
      if (g) return g;
      return { expr: TYPE_DEFAULT[declaredType], type: declaredType };
    }

    if (src.data.isSlider) {
      return { expr: uniformName(src.id), type: 'float' };
    }

    // Regular node: single output stored in a local.
    const out = src.data.outputs[0];
    if (!out) return { expr: TYPE_DEFAULT[declaredType], type: declaredType };
    return { expr: localName(src.id), type: out.type };
  }

  const functions: string[] = [];
  const locals: string[] = [];

  for (const id of order) {
    const node = byId.get(id);
    if (!node || node.data.isInput || node.data.isOutput || node.data.isSlider)
      continue;

    const out = node.data.outputs[0];
    if (!out) continue;

    // Function definition.
    const params = node.data.inputs
      .map((s) => `${s.type} ${s.name}`)
      .join(', ');
    const body = node.data.glsl.trim() || `return ${TYPE_DEFAULT[out.type]};`;
    functions.push(
      `${out.type} ${fnName(id)}(${params}) {\n${indent(body)}\n}`,
    );

    // Invocation -> local variable.
    const args = node.data.inputs
      .map((s) => {
        const r = resolveInput(id, s.id, s.type);
        return coerce(r.expr, r.type, s.type);
      })
      .join(', ');
    locals.push(`  ${out.type} ${localName(id)} = ${fnName(id)}(${args});`);
  }

  // Final color from the Output node's "color" input.
  const colorSocket = outputNode.data.inputs[0];
  let colorAssign = '  fragColor = vec4(0.0, 0.0, 0.0, 1.0);';
  if (colorSocket) {
    const r = resolveInput(outputNode.id, colorSocket.id, 'vec4');
    colorAssign = `  fragColor = ${coerce(r.expr, r.type, 'vec4')};`;
  }

  // One uniform per Slider node, driven live from the Controls panel.
  const sliderUniforms = nodes
    .filter((n) => n.data.isSlider)
    .map((n) => `uniform float ${uniformName(n.id)};`)
    .join('\n');

  const fragSource = `#version 300 es
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
${sliderUniforms ? sliderUniforms + '\n' : ''}
out vec4 fragColor;

${functions.join('\n\n')}

void main() {
  vec2 vUv = gl_FragCoord.xy / uResolution;
  vec2 vFragCoord = gl_FragCoord.xy;
  vec2 vResolution = uResolution;
  float vTime = uTime;
  vec2 vMouse = uMouse;
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
