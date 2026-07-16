import type { Node, Edge } from '@xyflow/react';
import type { ShaderNodeData, GLSLType } from '../types';
import { parseInputs } from '../compiler/parseInputs';

export type RFNode = Node<ShaderNodeData>;

let idCounter = 0;
export const nextId = (prefix = 'n') => `${prefix}_${idCounter++}`;

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

export interface NodeTemplate {
  kind: string;
  label: string;
  make: (id: string, x: number, y: number) => RFNode;
}

/**
 * A regular node. Its input sockets are derived from the `// @in <type> <name>`
 * directives in `glsl`, so the code fully describes the node's signature.
 */
function regular(
  kind: string,
  label: string,
  outputType: GLSLType,
  glsl: string,
): NodeTemplate {
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
        outputs: [{ id: 'out', name: 'out', type: outputType }],
      },
    }),
  };
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  { kind: 'slider', label: 'Slider', make: makeSliderNode },
  regular(
    'gradient',
    'Gradient',
    'vec3',
    `// @in vec2 uv
// @in float time
// classic animated palette
return 0.5 + 0.5 * cos(time + uv.xyx + vec3(0.0, 2.0, 4.0));`,
  ),
  regular(
    'add',
    'Add',
    'float',
    `// @in float a
// @in float b
return a + b;`,
  ),
  regular(
    'multiply',
    'Multiply',
    'float',
    `// @in float a
// @in float b
return a * b;`,
  ),
  regular(
    'mix',
    'Mix',
    'vec3',
    `// @in vec3 a
// @in vec3 b
// @in float t
return mix(a, b, clamp(t, 0.0, 1.0));`,
  ),
  regular(
    'sin',
    'Sin (time)',
    'float',
    `// @in float time
return 0.5 + 0.5 * sin(time);`,
  ),
  regular(
    'uvWarp',
    'UV Warp',
    'vec2',
    `// @in vec2 uv
// @in float time
return uv + 0.1 * vec2(sin(uv.y * 10.0 + time), cos(uv.x * 10.0 + time));`,
  ),
  regular(
    'color',
    'Color',
    'vec3',
    `// @in vec3 c
// constant or pass-through color
return c;`,
  ),
  regular(
    'circle',
    'Circle',
    'float',
    `// @in vec2 uv
// @in float radius
float d = distance(uv, vec2(0.5));
return smoothstep(radius, radius - 0.01, d);`,
  ),
];

export function makeDefaultGraph(): { nodes: RFNode[]; edges: Edge[] } {
  const input = makeInputNode('input', 0, 120);
  const gradientTemplate = NODE_TEMPLATES.find((t) => t.kind === 'gradient')!;
  const gradient = gradientTemplate.make('gradient', 320, 120);
  const output = makeOutputNode('output', 640, 160);

  const edges: Edge[] = [
    { id: 'e1', source: 'input', sourceHandle: 'uv', target: 'gradient', targetHandle: 'uv' },
    { id: 'e2', source: 'input', sourceHandle: 'time', target: 'gradient', targetHandle: 'time' },
    { id: 'e3', source: 'gradient', sourceHandle: 'out', target: 'output', targetHandle: 'color' },
  ];

  return { nodes: [input, gradient, output], edges };
}
