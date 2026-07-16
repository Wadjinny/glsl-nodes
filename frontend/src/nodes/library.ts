import type { Node, Edge } from '@xyflow/react';
import type { ShaderNodeData } from '../types';
import { parseInputs, parseOutput } from '../compiler/parseInputs';

export type RFNode = Node<ShaderNodeData>;

let idCounter = 0;
export const nextId = (prefix = 'n') => `${prefix}_${idCounter++}`;

/**
 * Advance the id counter past any `<kind>_<n>` ids in a loaded graph so
 * ids handed out by nextId() can't collide with imported nodes.
 */
export function bumpIdCounterPast(nodes: RFNode[]): void {
  for (const n of nodes) {
    const m = n.id.match(/_(\d+)$/);
    if (m) idCounter = Math.max(idCounter, Number(m[1]) + 1);
  }
}

export function makeInputNode(id: string, x: number, y: number): RFNode {
  return {
    id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: 'input',
      label: 'Input',
      glsl: '',
      isInput: true,
      inputs: [],
      outputs: [
        { id: 'uv', name: 'uv', type: 'vec2' },
        { id: 'fragCoord', name: 'fragCoord', type: 'vec2' },
        { id: 'resolution', name: 'resolution', type: 'vec2' },
        { id: 'time', name: 'time', type: 'float' },
        { id: 'mouse', name: 'mouse', type: 'vec2' },
      ],
    },
  };
}

export function makeOutputNode(id: string, x: number, y: number): RFNode {
  return {
    id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: 'output',
      label: 'Output',
      glsl: '',
      isOutput: true,
      inputs: [{ id: 'color', name: 'color', type: 'vec4' }],
      outputs: [],
    },
  };
}

export function makeSliderNode(id: string, x: number, y: number): RFNode {
  return {
    id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: 'slider',
      label: 'Slider',
      glsl: '',
      isSlider: true,
      value: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      inputs: [],
      outputs: [{ id: 'out', name: 'value', type: 'float' }],
    },
  };
}

export function makeColorNode(id: string, x: number, y: number): RFNode {
  return {
    id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: 'color',
      label: 'Color',
      glsl: '',
      isColor: true,
      rgb: [1, 0.5, 0.2],
      inputs: [],
      outputs: [{ id: 'out', name: 'color', type: 'vec3' }],
    },
  };
}

export function makeVec2Node(id: string, x: number, y: number): RFNode {
  return {
    id,
    type: 'shader',
    position: { x, y },
    data: {
      kind: 'vec2',
      label: 'Vec2',
      glsl: '',
      isVec2: true,
      vec: [0.5, 0.5],
      min: 0,
      max: 1,
      inputs: [],
      outputs: [{ id: 'out', name: 'value', type: 'vec2' }],
    },
  };
}

export interface NodeTemplate {
  kind: string;
  label: string;
  make: (id: string, x: number, y: number) => RFNode;
}

/**
 * A regular node. Its input sockets come from `// @in <type> <name>` directives
 * and its output from `// @out <type> [name]`, so the code fully describes the
 * node's signature.
 */
function regular(kind: string, label: string, glsl: string): NodeTemplate {
  const out = parseOutput(glsl);
  return {
    kind,
    label,
    make: (id, x, y) => ({
      id,
      type: 'shader',
      position: { x, y },
      data: {
        kind,
        label,
        glsl,
        inputs: parseInputs(glsl),
        outputs: [{ id: 'out', name: out?.name ?? 'out', type: out?.type ?? 'vec4' }],
      },
    }),
  };
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  // Built-ins (uv, time, ...) are ambient in every node body; the Input node
  // exists for explicit wiring, e.g. routing one value into several sockets.
  { kind: 'input', label: 'Input', make: makeInputNode },
  { kind: 'slider', label: 'Slider', make: makeSliderNode },
  { kind: 'color', label: 'Color', make: makeColorNode },
  { kind: 'vec2', label: 'Vec2', make: makeVec2Node },
  regular(
    'gradient',
    'Gradient',
    `// @in vec2 uv
// @in float time
// @out vec3
// classic animated palette
return 0.5 + 0.5 * cos(time + uv.xyx + vec3(0.0, 2.0, 4.0));`,
  ),
  regular(
    'add',
    'Add',
    `// @in float a
// @in float b
// @out float
return a + b;`,
  ),
  regular(
    'multiply',
    'Multiply',
    `// @in float a
// @in float b
// @out float
return a * b;`,
  ),
  regular(
    'mix',
    'Mix',
    `// @in vec3 a
// @in vec3 b
// @in float t
// @out vec3
return mix(a, b, clamp(t, 0.0, 1.0));`,
  ),
  regular(
    'sin',
    'Sin (time)',
    `// @in float time
// @out float
return 0.5 + 0.5 * sin(time);`,
  ),
  regular(
    'uvWarp',
    'UV Warp',
    `// @in vec2 uv
// @in float time
// @out vec2
return uv + 0.1 * vec2(sin(uv.y * 10.0 + time), cos(uv.x * 10.0 + time));`,
  ),
  regular(
    'circle',
    'Circle',
    `// @in vec2 uv
// @in float radius
// @out float
// aspect-corrected: stays round on non-square canvases
vec2 p = uv - 0.5;
p.x *= resolution.x / resolution.y;
float d = length(p);
return smoothstep(radius, radius - 0.01, d);`,
  ),
];

export function makeDefaultGraph(): { nodes: RFNode[]; edges: Edge[] } {
  const gradientTemplate = NODE_TEMPLATES.find((t) => t.kind === 'gradient')!;
  const gradient = gradientTemplate.make('gradient', 200, 120);
  const output = makeOutputNode('output', 520, 160);

  // Gradient's uv/time inputs are left unwired: they fall back to the
  // built-ins, demonstrating that nodes work without an Input node.
  const edges: Edge[] = [
    { id: 'e1', source: 'gradient', sourceHandle: 'out', target: 'output', targetHandle: 'color' },
  ];

  return { nodes: [gradient, output], edges };
}
