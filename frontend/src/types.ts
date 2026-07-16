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
