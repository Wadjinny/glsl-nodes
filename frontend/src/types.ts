export type GLSLType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'mat2'
  | 'mat3'
  | 'func';

export interface Socket {
  /** Stable id used as the React Flow handle id. */
  id: string;
  /** Name used as the GLSL function parameter / return slot. */
  name: string;
  type: GLSLType;
}

/** Domain definition of a node, stored on the React Flow node's `data`. */
export interface ShaderNodeData {
  /** Index signature so the type satisfies React Flow's `Record<string, unknown>` constraint. */
  [key: string]: unknown;
  kind: string;
  label: string;
  /**
   * GLSL function body. For a regular node it must `return` a value of the
   * (single) output's type, and may reference each input socket by `name`.
   * `@type func` nodes define a callable GLSL function (graph out is `func`).
   * Input and Output nodes are special-cased by the compiler and ignore this.
   */
  glsl: string;
  /**
   * When set, the compiler emits this as the GLSL function name instead of
   * `node_<id>`, so other node bodies can call it by name.
   */
  glslName?: string;
  /**
   * Signature params for `@type func` nodes (from `@fin` / legacy value
   * `@in`s). Not graph wires — shown as labels; used when emitting the GLSL
   * function. Graph `@in`s on func nodes are closed-over specializations.
   */
  funcSignature?: Socket[];
  inputs: Socket[];
  outputs: Socket[];
  /** True for the special Input node (provides built-in globals). */
  isInput?: boolean;
  /** True for the special Output node (writes the final color). */
  isOutput?: boolean;
  /** True for a Slider node: outputs a float backed by a live uniform. */
  isSlider?: boolean;
  /** Slider state (only used when isSlider). */
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  /** True for a Color node: outputs a vec3 backed by a live uniform. */
  isColor?: boolean;
  /** Color state, normalized 0-1 RGB (only used when isColor). */
  rgb?: [number, number, number];
  /** True for a Vec2 node: outputs a vec2 backed by a live uniform (uses min/max for both axes). */
  isVec2?: boolean;
  /** Vec2 state (only used when isVec2). */
  vec?: [number, number];
}

export const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/** Value for a control-node uniform: float (slider), vec2 (pad), or vec3 (color). */
export type UniformValue = number | [number, number] | [number, number, number];

/**
 * Control nodes (Slider / Color / Vec2) have no GLSL body: they compile to a
 * live uniform edited from the Controls panel. These three helpers are the
 * single place that knows which flags make a node a control and what uniform
 * backs it — a new control type only needs to extend them (plus its maker,
 * hydration, and Controls-panel row).
 */
export function isControlNode(d: ShaderNodeData): boolean {
  return Boolean(d.isSlider || d.isColor || d.isVec2);
}

/** True when this node defines a callable GLSL function (`@type func` / out func). */
export function isFuncNode(d: ShaderNodeData): boolean {
  return d.outputs[0]?.type === 'func';
}

/** GLSL type of a control node's uniform (null for non-control nodes). */
export function controlUniformType(d: ShaderNodeData): GLSLType | null {
  if (d.isSlider) return 'float';
  if (d.isVec2) return 'vec2';
  if (d.isColor) return 'vec3';
  return null;
}

/** Current value of a control node's uniform. */
export function controlUniformValue(d: ShaderNodeData): UniformValue {
  if (d.isSlider) return d.value ?? 0;
  if (d.isVec2) return d.vec ?? [0, 0];
  if (d.isColor) return d.rgb ?? [1, 1, 1];
  return 0;
}

/**
 * Pick the input socket to receive a wire carrying `srcType`: prefer a free
 * socket with the exact type, then any free socket, then an exact-type match
 * (whose existing wire the caller replaces), then the first input.
 */
export function chooseInputSocket(
  inputs: Socket[],
  srcType: GLSLType | null,
  taken: ReadonlySet<string> = new Set(),
): Socket | undefined {
  return (
    inputs.find((s) => !taken.has(s.id) && s.type === srcType) ??
    inputs.find((s) => !taken.has(s.id)) ??
    inputs.find((s) => s.type === srcType) ??
    inputs[0]
  );
}

/** Normalized 0-1 RGB -> #rrggbb (for <input type="color"> and swatches). */
export function rgbToHex(rgb: [number, number, number] | undefined): string {
  const [r, g, b] = rgb ?? [1, 1, 1];
  const h = (v: number) =>
    Math.round(clamp(v, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** #rrggbb -> normalized 0-1 RGB (falls back to white on malformed input). */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const TYPE_COLORS: Record<GLSLType, string> = {
  float: '#9d9d9d',
  vec2: '#4ec9b0',
  vec3: '#569cd6',
  vec4: '#c586c0',
  mat2: '#d7ba7d',
  mat3: '#ce9178',
  func: '#dcdcaa',
};

export const TYPE_DEFAULT: Record<GLSLType, string> = {
  float: '0.0',
  vec2: 'vec2(0.0)',
  vec3: 'vec3(0.0)',
  vec4: 'vec4(0.0)',
  mat2: 'mat2(1.0)',
  mat3: 'mat3(1.0)',
  // Unconnected func inputs are a compile-time error; placeholder unused.
  func: '/* missing func */',
};
