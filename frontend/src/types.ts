export type GLSLType = 'float' | 'vec2' | 'vec3' | 'vec4';

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
   * Input and Output nodes are special-cased by the compiler and ignore this.
   */
  glsl: string;
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

/** Normalized 0-1 RGB -> #rrggbb (for <input type="color"> and swatches). */
export function rgbToHex(rgb: [number, number, number] | undefined): string {
  const [r, g, b] = rgb ?? [1, 1, 1];
  const h = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
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
};

export const TYPE_DEFAULT: Record<GLSLType, string> = {
  float: '0.0',
  vec2: 'vec2(0.0)',
  vec3: 'vec3(0.0)',
  vec4: 'vec4(0.0)',
};
