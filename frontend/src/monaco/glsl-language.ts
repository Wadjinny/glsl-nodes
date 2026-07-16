import type { Monaco } from '@monaco-editor/react';

let registered = false;

/** Register a lightweight GLSL language for Monaco (syntax highlighting). */
export function registerGLSL(monaco: Monaco) {
  if (registered) return;
  registered = true;

  monaco.languages.register({ id: 'glsl' });

  // Comment syntax enables Monaco's built-in toggle shortcuts
  // (Ctrl+/ line comment, Shift+Alt+A block comment).
  monaco.languages.setLanguageConfiguration('glsl', {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
    ],
  });

  monaco.languages.setMonarchTokensProvider('glsl', {
    keywords: [
      'attribute', 'const', 'uniform', 'varying', 'break', 'continue', 'do',
      'for', 'while', 'if', 'else', 'in', 'out', 'inout', 'return', 'struct',
      'discard', 'precision', 'highp', 'mediump', 'lowp', 'void', 'true', 'false',
    ],
    types: [
      'bool', 'int', 'uint', 'float', 'double',
      'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
      'bvec2', 'bvec3', 'bvec4', 'mat2', 'mat3', 'mat4',
      'sampler2D', 'samplerCube',
    ],
    builtins: [
      'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
      'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
      'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max',
      'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance', 'dot',
      'cross', 'normalize', 'reflect', 'refract', 'texture', 'texture2D',
      'gl_FragCoord', 'gl_Position', 'gl_VertexID', 'fragColor',
      // Ambient built-ins provided by the graph compiler.
      'uv', 'fragCoord', 'resolution', 'time', 'mouse',
    ],
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            '@keywords': 'keyword',
            '@types': 'type',
            '@builtins': 'predefined',
            '@default': 'identifier',
          },
        }],
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/#.*$/, 'keyword'],
        [/\d*\.\d+([eE][-+]?\d+)?[fF]?/, 'number.float'],
        [/\d+[fF]?/, 'number'],
        [/[{}()\[\]]/, '@brackets'],
        [/[;,.]/, 'delimiter'],
        [/[-+*/%=<>!&|^~?:]/, 'operator'],
        [/"([^"\\]|\\.)*"/, 'string'],
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment'],
      ],
    },
  });
}
