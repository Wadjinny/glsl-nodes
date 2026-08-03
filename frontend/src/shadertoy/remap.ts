import type { GLSLType } from '../types';
import { formatGlsl } from '../glsl/formatGlsl';
import {
  isSupportedSocketType,
  type ParsedFunction,
  type ParsedParam,
} from './parse';

const UNSUPPORTED_BUILTIN_RE =
  /\b(iChannel\d*|iDate|iFrame|iSampleRate|iChannelTime|iChannelResolution)\b/;

/** Common GLSL builtins sometimes used as local variable names in ShaderToy. */
const SHADOWABLE_BUILTINS = [
  'mix',
  'step',
  'mod',
  'dot',
  'min',
  'max',
  'clamp',
  'pow',
  'length',
  'normalize',
  'reflect',
  'sign',
  'floor',
  'ceil',
  'fract',
  'abs',
];

/**
 * Remap ShaderToy builtins to glsl-nodes names. Longer / more specific
 * replacements first so `.xy` / `.z` forms win over bare identifiers.
 */
export function remapBuiltins(code: string): {
  code: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (UNSUPPORTED_BUILTIN_RE.test(code)) {
    warnings.push(
      'Unsupported ShaderToy builtins detected (iChannel / iDate / iFrame / …); left as-is and may fail to compile.',
    );
  }

  let out = code;
  const reps: Array<[RegExp, string]> = [
    [/\biResolution\.xy\b/g, 'resolution'],
    [/\biResolution\.x\b/g, 'resolution.x'],
    [/\biResolution\.y\b/g, 'resolution.y'],
    [/\biResolution\.z\b/g, '1.0'],
    [/\biResolution\b/g, 'resolution'],
    [/\biMouse\.xy\b/g, 'mouse'],
    [/\biMouse\.zw\b/g, 'vec2(0.0)'],
    [/\biMouse\.x\b/g, 'mouse.x'],
    [/\biMouse\.y\b/g, 'mouse.y'],
    [/\biMouse\b/g, 'mouse'],
    [/\biTime\b/g, 'time'],
  ];
  for (const [re, to] of reps) out = out.replace(re, to);

  if (/\biResolution\b/.test(code) && !/\biResolution\.(xy|[xyz])\b/.test(code)) {
    warnings.push(
      'Bare iResolution remapped to vec2 resolution (ShaderToy uses vec3).',
    );
  }

  const unshadow = unshadowBuiltinLocals(out);
  out = unshadow.code;
  warnings.push(...unshadow.warnings);

  return { code: out, warnings };
}

/**
 * Rename locals that shadow GLSL builtins (`bool mix = …`) so they don't
 * break calls like `mix(a, b, t)`. Call sites `mix(` are left alone.
 */
function unshadowBuiltinLocals(code: string): {
  code: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let out = code;
  for (const name of SHADOWABLE_BUILTINS) {
    const declRe = new RegExp(
      `\\b((?:bool|float|int|vec2|vec3|vec4|mat2|mat3)\\s+)${name}\\b`,
    );
    if (!declRe.test(out)) continue;
    const alias = `${name}_var`;
    out = out.replace(
      new RegExp(
        `\\b((?:bool|float|int|vec2|vec3|vec4|mat2|mat3)\\s+)${name}\\b`,
        'g',
      ),
      `$1${alias}`,
    );
    out = out.replace(new RegExp(`\\b${name}\\b(?!\\s*\\()`, 'g'), alias);
    warnings.push(
      `Renamed local '${name}' to '${alias}' to avoid shadowing the GLSL builtin.`,
    );
  }
  return { code: out, warnings };
}

export interface ConvertedFunction {
  name: string;
  /** Node GLSL body including // @in / // @out / // @type directives. */
  glsl: string;
  outType: GLSLType;
  /** True when this is a `@type func` definition node. */
  isFunc: boolean;
  warnings: string[];
  skipped?: string;
  /**
   * When set, this helper was a `void` with a single inout/out param rewritten
   * to return that value. Call sites should assign arg[`inoutAssignArg`].
   */
  inoutAssignArg?: number;
}

function inParams(params: ParsedParam[]): ParsedParam[] {
  return params.filter((p) => p.qualifier !== 'out' && p.qualifier !== 'inout');
}

function buildValueDirectives(
  params: ParsedParam[],
  outType: GLSLType,
  callees: string[],
): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const headers: string[] = [];
  for (const p of params) {
    if (!isSupportedSocketType(p.type)) {
      warnings.push(
        `Parameter ${p.name}: unsupported type '${p.type}' (skipped socket).`,
      );
      continue;
    }
    headers.push(`// @in ${p.type} ${p.name}`);
  }
  for (const c of callees) {
    headers.push(`// @in func ${c}`);
  }
  headers.push(`// @out ${outType}`);
  return { headers, warnings };
}

function buildFuncDirectives(
  params: ParsedParam[],
  outType: GLSLType,
  callees: string[],
): { headers: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const headers: string[] = ['// @type func'];
  for (const c of callees) {
    headers.push(`// @fin func ${c}`);
  }
  for (const p of params) {
    if (!isSupportedSocketType(p.type)) {
      warnings.push(
        `Parameter ${p.name}: unsupported type '${p.type}' (skipped socket).`,
      );
      continue;
    }
    headers.push(`// @fin ${p.type} ${p.name}`);
  }
  headers.push(`// @fout ${outType}`);
  return { headers, warnings };
}

/**
 * Convert a parsed function into a node GLSL body.
 * Helpers become `@type func` nodes; `mainImage` stays a value node.
 * `callees` are other imported functions this body calls → `@fin func` wires.
 *
 * `void` helpers with a single `inout`/`out` value param are rewritten to
 * return that value (call sites get assignment rewrites in importGraph).
 */
export function convertFunction(
  fn: ParsedFunction,
  callees: string[] = [],
): ConvertedFunction {
  const warnings: string[] = [];

  if (fn.name === 'mainImage') {
    return convertMainImage(fn, callees);
  }

  const inoutLike = fn.params.filter(
    (p) => p.qualifier === 'out' || p.qualifier === 'inout',
  );

  if (fn.returnType === 'void') {
    if (
      inoutLike.length === 1 &&
      isSupportedSocketType(inoutLike[0].type)
    ) {
      return convertInoutVoid(fn, callees, inoutLike[0]);
    }
    return {
      name: fn.name,
      glsl: '',
      outType: 'float',
      isFunc: true,
      warnings,
      skipped: `Skipped void function '${fn.name}' (not mainImage).`,
    };
  }

  if (!isSupportedSocketType(fn.returnType)) {
    return {
      name: fn.name,
      glsl: '',
      outType: 'float',
      isFunc: true,
      warnings,
      skipped: `Skipped '${fn.name}': unsupported return type '${fn.returnType}'.`,
    };
  }

  if (inoutLike.length) {
    return {
      name: fn.name,
      glsl: '',
      outType: fn.returnType,
      isFunc: true,
      warnings,
      skipped: `Skipped '${fn.name}': out/inout parameters are not supported on non-void functions.`,
    };
  }

  const params = inParams(fn.params);
  const { headers, warnings: dw } = buildFuncDirectives(
    params,
    fn.returnType,
    callees,
  );
  warnings.push(...dw);

  const remapped = remapBuiltins(fn.body);
  warnings.push(...remapped.warnings);

  const glsl = formatGlsl([...headers, '', remapped.code.trim()].join('\n'));
  return {
    name: fn.name,
    glsl,
    outType: fn.returnType,
    isFunc: true,
    warnings,
  };
}

/**
 * `void Foo(inout T x, …)` → `T Foo(T x, …) { …; return x; }`
 */
function convertInoutVoid(
  fn: ParsedFunction,
  callees: string[],
  target: ParsedParam,
): ConvertedFunction {
  const warnings: string[] = [];
  const outType = target.type as GLSLType;
  const argIndex = fn.params.indexOf(target);

  warnings.push(
    `Rewrote void ${fn.name}(${target.qualifier} ${target.type} ${target.name}, …) to return ${outType}; call sites assign the result.`,
  );

  // Former inout/out becomes a normal value parameter.
  const params = fn.params.filter((p) => isSupportedSocketType(p.type));
  const { headers, warnings: dw } = buildFuncDirectives(
    params,
    outType,
    callees,
  );
  warnings.push(...dw);

  const remapped = remapBuiltins(fn.body);
  warnings.push(...remapped.warnings);

  const body = remapped.code.trim();
  const withReturn = /(?:^|\n)\s*return\b/.test(body)
    ? body
    : `${body}\nreturn ${target.name};`;

  const glsl = formatGlsl([...headers, '', withReturn].join('\n'));
  return {
    name: fn.name,
    glsl,
    outType,
    isFunc: true,
    warnings,
    inoutAssignArg: argIndex >= 0 ? argIndex : 0,
  };
}

function convertMainImage(
  fn: ParsedFunction,
  callees: string[],
): ConvertedFunction {
  const warnings: string[] = [];
  const outParam =
    fn.params.find((p) => p.qualifier === 'out' && p.type === 'vec4') ??
    fn.params.find((p) => p.qualifier === 'out');

  const outName = outParam?.name ?? 'fragColor';
  const outType: GLSLType =
    outParam && isSupportedSocketType(outParam.type) ? outParam.type : 'vec4';

  const params = inParams(fn.params);
  const { headers, warnings: dw } = buildValueDirectives(
    params,
    outType,
    callees,
  );
  warnings.push(...dw);

  const remapped = remapBuiltins(fn.body);
  warnings.push(...remapped.warnings);

  const body = remapped.code.trim();
  const wrapped = [
    `${outType} ${outName};`,
    body,
    `return ${outName};`,
  ].join('\n');

  const glsl = formatGlsl([...headers, '', wrapped].join('\n'));
  return {
    name: fn.name,
    glsl,
    outType,
    isFunc: false,
    warnings,
  };
}
